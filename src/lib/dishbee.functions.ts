import { COMING_SOON, COMING_SOON_MESSAGE } from "./launch-status";
import {
  isMealDeckLaunchFulfilment,
  isMealDeckLaunchLocation,
  MEALDECK_LAUNCH_LOCATIONS,
  MEALDECK_LAUNCH_LOCATION_MESSAGE,
} from "./mealdeck-launch-locations";
import {
  readMealDeckBackendConfig,
  readMealDeckCheckoutServerKey,
  readMealDeckRuntimeConfig,
} from "./mealdeck-runtime-config";
import { estimateGoodsFromDishbee, verifyDishbeeFeeResult } from "./mealdeck-live-price-estimate";
import { safeCourierTrackingUrl } from "./mealdeck-tracking-links";
import { parseMealDeckTrackingReply } from "./mealdeck-tracking-contract";
import {
  mayCreateCustomerOrder,
  parseDishbeeCheckoutAttemptReceipt,
  resolveDishbeeServiceability,
} from "./mealdeck-dishbee-contract";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  brands,
  resolveSampleServiceability,
  sampleLocationOpen,
  sampleMenu,
  type FulfilmentType,
  type LocationKey,
  type MenuItem,
} from "./mealdeck";

const locationSchema = z.enum(["luton", "stalbans"]);
const fulfilmentSchema = z.enum(["delivery", "pickup", "curbside", "dinein"]);

type DishbeeConfig = {
  url: string;
  anonKey: string;
  tenantId: string;
  locationId: string;
};

function readBase() {
  const selected = readMealDeckBackendConfig(process.env);
  return selected.status === "ready"
    ? { url: selected.backend.url, anonKey: selected.backend.publishableKey }
    : null;
}

function readConfig(location: LocationKey): DishbeeConfig | null {
  if (!isMealDeckLaunchLocation(location)) return null;
  // One canonical MealDeck tenant with distinct location IDs. Conflicts
  // disable checkout, catalogue and paid-order routing instead of selecting
  // an arbitrary location's tenant.
  return readMealDeckRuntimeConfig(process.env, location);
}

function dishbeeClient(config: { url: string; anonKey: string }) {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false },
  });
}

/** Server-only key for MealDeck's service-role-only idempotent RPC.
 * Never used by the browser, marketplace catalogue or public tracking.
 * Refuse legacy anonymous checkout rather than silently bypass P27.
 */
function checkoutServerClient(config: DishbeeConfig) {
  const key = readMealDeckCheckoutServerKey(process.env, config);
  if (!key) return null;
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normaliseName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function frontendBrandId(row: Record<string, unknown>) {
  const rawId = String(row["brand_id"] ?? "");
  const rawSlug = String(row["brand_slug"] ?? "");
  const rawName = String(row["brand_name"] ?? "");
  const matched = brands.find(
    (brand) =>
      brand.id === rawId ||
      brand.id === rawSlug ||
      normaliseName(brand.name) === normaliseName(rawName),
  );
  return matched?.id ?? (rawSlug || rawId);
}

export type ServiceabilityResult =
  | {
      served: true;
      location: LocationKey;
      channelOpen: boolean;
      message: string;
    }
  | {
      served: false;
      message: string;
      alternativeFulfilments?: FulfilmentType[] | undefined;
    };

export const checkServiceability = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        postcode: z.string().trim().min(2).max(12),
        fulfilment: fulfilmentSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ServiceabilityResult> => {
    const fallback = (): ServiceabilityResult => {
      const result = resolveSampleServiceability(data.postcode, data.fulfilment);
      return result.locationKey
        ? {
            served: true,
            location: result.locationKey,
            channelOpen: sampleLocationOpen(result.locationKey),
            message: result.message,
          }
        : {
            served: false,
            message: result.message,
            alternativeFulfilments: result.alternativeFulfilments,
          };
    };

    const base = readBase();
    if (!base)
      return COMING_SOON
        ? fallback()
        : {
            served: false,
            message: "Live MealDeck serviceability is not connected yet.",
          };

    try {
      const { data: rows, error } = await dishbeeClient(base).rpc(
        "public_mealdeck_serviceability",
        {
          p_postcode: data.postcode,
          p_fulfilment: data.fulfilment,
        },
      );
      if (error) throw new Error(error.message);

      const approved = MEALDECK_LAUNCH_LOCATIONS.flatMap((key) => {
        const kitchen = readConfig(key);
        return kitchen
          ? [
              {
                location: key,
                tenantId: kitchen.tenantId,
                locationId: kitchen.locationId,
              },
            ]
          : [];
      });
      // Dishbee tenant and location UUIDs determine the kitchen. Never infer
      // a payment destination from a city name or postcode prefix.
      const result = resolveDishbeeServiceability(rows, approved);
      return result.served && !isMealDeckLaunchFulfilment(result.location, data.fulfilment)
        ? { served: false, message: "This MealDeck fulfilment is not available." }
        : result;
    } catch (error) {
      console.error("Dishbee serviceability connection failed", error);
      // An unavailable canonical service is NOT evidence of postcode coverage.
      return {
        served: false,
        message: "We couldn't verify MealDeck coverage right now. Please try again.",
      };
    }
  });

export type CatalogueResult = {
  source: "live" | "sample";
  channelOpen: boolean;
  items: MenuItem[];
  notice?: string | undefined;
};

export const getCatalogue = createServerFn({ method: "GET" })
  .inputValidator((input: { location: LocationKey }) =>
    z.object({ location: locationSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<CatalogueResult> => {
    if (!isMealDeckLaunchLocation(data.location)) {
      return {
        source: "sample",
        channelOpen: false,
        items: [],
        notice: MEALDECK_LAUNCH_LOCATION_MESSAGE,
      };
    }
    const config = readConfig(data.location);

    if (!config) {
      return {
        source: "sample",
        channelOpen: sampleLocationOpen(data.location),
        items: sampleMenu(data.location),
        notice: "Showing a preview menu while live ordering is unavailable.",
      };
    }

    try {
      const client = dishbeeClient(config);
      let legacyCatalogue = false;
      let { data: rows, error } = await client.rpc("public_mealdeck_catalogue", {
        p_tenant: config.tenantId,
        p_location: config.locationId,
      });

      // Backward-compatible fallback during staggered deployments.
      if (error) {
        legacyCatalogue = true;
        const fallback = await client.rpc("public_location_catalogue", {
          p_tenant: config.tenantId,
          p_location: config.locationId,
          p_channel: "mealdeck",
        });
        rows = fallback.data;
        error = fallback.error;
      }

      if (error) throw new Error(error.message);

      const list = (rows ?? []) as Array<Record<string, unknown>>;

      return {
        source: legacyCatalogue ? "sample" : "live",
        channelOpen: list.length ? Boolean(list[0]!["channel_open"]) : false,
        notice: legacyCatalogue
          ? "The live menu is updating. Checkout is temporarily disabled."
          : undefined,
        items: list.map((row) => {
          const groups = Array.isArray(row["modifier_groups"])
            ? (row["modifier_groups"] as Array<Record<string, unknown>>).map((group) => ({
                id: String(group["id"]),
                name: String(group["name"] ?? "Options"),
                minSelect: Number(group["minSelect"] ?? 0),
                maxSelect: Number(group["maxSelect"] ?? 1),
                options: Array.isArray(group["options"])
                  ? (group["options"] as Array<Record<string, unknown>>).map((option) => ({
                      id: String(option["id"]),
                      name: String(option["name"]),
                      priceDeltaPence: Number(option["priceDeltaPence"] ?? 0),
                    }))
                  : [],
              }))
            : [];

          const item: MenuItem = {
            id: String(row["item_id"]),
            brandId: frontendBrandId(row),
            category: String(row["category_name"] ?? "Menu"),
            name: String(row["item_name"]),
            pricePence: Number(row["price_pence"] ?? 0),
            imageUrl: row["image_url"] ? String(row["image_url"]) : null,
            allergens: Array.isArray(row["allergens"]) ? row["allergens"].map(String) : [],
            hasModifiers: groups.length > 0,
            modifierGroups: groups,
          };

          if (row["description"]) item.description = String(row["description"]);
          return item;
        }),
      };
    } catch (error) {
      console.error("Dishbee catalogue request failed", error);
      return {
        source: "sample",
        channelOpen: sampleLocationOpen(data.location),
        items: sampleMenu(data.location),
        notice: "The live menu is temporarily unavailable, so a preview menu is shown.",
      };
    }
  });

/** Read-only estimate from the CURRENT server-side Dishbee catalogue.
 * Never creates a payment session, captures funds or confirms serviceability
 * from a browser price. The final Dishbee order is repriced independently.
 */
export type DeliveryEstimateResult =
  | {
      ready: true;
      kind: "estimate";
      goodsPence: number;
      deliveryPence: number;
      totalPence: number;
      quoteToken: string;
      expiresAt: string;
    }
  | { ready: false; reason: "unavailable" | "menu_changed" | "policy_unavailable" };

const activeFulfilmentSchema = z.enum(["delivery", "pickup", "curbside"]);
const quoteLinesSchema = z
  .array(
    z.object({
      itemId: z.string().uuid(),
      quantity: z.number().int().min(1).max(50),
      modifierIds: z.array(z.string().uuid()).max(20),
    }),
  )
  .min(1)
  .max(60);
const deliveryEstimateInput = z.object({
  location: locationSchema,
  fulfilment: activeFulfilmentSchema,
  postcode: z.string().trim().min(5).max(12),
  lines: quoteLinesSchema,
});
type QuoteRequest = z.infer<typeof deliveryEstimateInput>;
type CurrentDishbeeQuote =
  | {
      ready: true;
      amounts: { currency: "GBP"; goodsPence: number; deliveryPence: number; totalPence: number };
    }
  | { ready: false; reason: "unavailable" | "menu_changed" | "policy_unavailable" };

/** Shared canonical repricing for both the estimate and the final checkout.
 * Each call reloads current serviceability, menu/option IDs and delivery
 * policy from Dishbee. The client has no influence over amounts.
 */
async function readCurrentDishbeeQuote(
  config: DishbeeConfig,
  request: QuoteRequest,
): Promise<CurrentDishbeeQuote> {
  if (!isMealDeckLaunchFulfilment(request.location, request.fulfilment)) {
    return { ready: false, reason: "unavailable" };
  }
  const sb = dishbeeClient(config);
  try {
    const service = await sb.rpc("public_mealdeck_serviceability", {
      p_postcode: request.postcode,
      p_fulfilment: request.fulfilment,
    });
    if (service.error) return { ready: false, reason: "unavailable" };
    const approved = resolveDishbeeServiceability(service.data, [
      {
        location: request.location,
        tenantId: config.tenantId,
        locationId: config.locationId,
      },
    ]);
    if (!approved.served || approved.location !== request.location || !approved.channelOpen)
      return { ready: false, reason: "unavailable" };
    const catalogue = await sb.rpc("public_mealdeck_catalogue", {
      p_tenant: config.tenantId,
      p_location: config.locationId,
    });
    if (catalogue.error || !Array.isArray(catalogue.data))
      return { ready: false, reason: "unavailable" };
    const priced = estimateGoodsFromDishbee(catalogue.data, request.lines);
    if (!priced.valid) return { ready: false, reason: "menu_changed" };

    let delivery = 0;
    if (request.fulfilment === "delivery") {
      const fee = await sb.rpc("public_mealdeck_delivery_fee", {
        p_location: config.locationId,
        p_order_value_pence: priced.goodsPence,
      });
      if (fee.error) return { ready: false, reason: "policy_unavailable" };
      const verifiedFee = verifyDishbeeFeeResult(fee.data);
      if (verifiedFee === null) return { ready: false, reason: "policy_unavailable" };
      delivery = verifiedFee;
    }
    if (priced.goodsPence + delivery > 10_000_000)
      return { ready: false, reason: "policy_unavailable" };
    return {
      ready: true,
      amounts: {
        currency: "GBP",
        goodsPence: priced.goodsPence,
        deliveryPence: delivery,
        totalPence: priced.goodsPence + delivery,
      },
    };
  } catch {
    // Do not expose postcode, menu, tenant or provider internals.
    return { ready: false, reason: "unavailable" };
  }
}

export const estimateDishbeeDelivery = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => deliveryEstimateInput.parse(input))
  .handler(async ({ data }): Promise<DeliveryEstimateResult> => {
    const config = readConfig(data.location);
    if (!config) return { ready: false, reason: "unavailable" };
    const current = await readCurrentDishbeeQuote(config, data);
    if (!current.ready) return current;
    const { issueMealDeckQuote } = await import("../server/mealdeck-quote");
    const token = issueMealDeckQuote({
      binding: {
        tenantId: config.tenantId,
        locationId: config.locationId,
        location: data.location,
        fulfilment: data.fulfilment,
        postcode: data.postcode,
        lines: data.lines,
      },
      amounts: current.amounts,
      secret: process.env["MEALDECK_QUOTE_SIGNING_SECRET"],
      nowMs: Date.now(),
    });
    if (!token.ready) return { ready: false, reason: "policy_unavailable" };
    return {
      ready: true,
      kind: "estimate",
      ...current.amounts,
      quoteToken: token.token,
      expiresAt: token.expiresAt,
    };
  });

const orderSchema = z
  .object({
    location: locationSchema,
    fulfilment: fulfilmentSchema,
    quoteToken: z.string().min(40).max(1536),
    attemptId: z
      .string()
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        "A secure checkout attempt identifier is required",
      ),
    lines: z
      .array(
        z.object({
          itemId: z.string().min(1),
          quantity: z.number().int().min(1).max(50),
          modifiers: z
            .array(
              z.object({
                id: z.string().min(1).max(80),
                groupId: z.string().min(1).max(80),
                groupName: z.string().max(120),
                name: z.string().max(80),
                priceDeltaPence: z.number().int(),
              }),
            )
            .max(20),
        }),
      )
      .min(1)
      .max(60),
    customer: z.object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(5).max(40),
      email: z.string().email().max(160).optional().or(z.literal("")),
      vehicleRegistration: z.string().trim().max(12).optional().or(z.literal("")),
      carMake: z.string().trim().max(60).optional().or(z.literal("")),
      address1: z.string().max(200).optional().or(z.literal("")),
      city: z.string().max(120).optional().or(z.literal("")),
      postcode: z.string().trim().min(2).max(12),
      notes: z.string().max(400).optional().or(z.literal("")),
    }),
  })
  .superRefine((value, ctx) => {
    if (!isMealDeckLaunchFulfilment(value.location, value.fulfilment)) {
      ctx.addIssue({
        code: "custom",
        message: isMealDeckLaunchLocation(value.location)
          ? "This MealDeck fulfilment is not available."
          : MEALDECK_LAUNCH_LOCATION_MESSAGE,
      });
    }

    if (value.fulfilment === "delivery" && (!value.customer.address1 || !value.customer.postcode)) {
      ctx.addIssue({
        code: "custom",
        message: "Delivery address required",
      });
    }

    if (
      value.fulfilment === "curbside" &&
      (!value.customer.carMake || !value.customer.vehicleRegistration)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Car make and registration required",
      });
    }
  });

export type PlaceOrderResult =
  | {
      status: "payment_required";
      orderId: string;
      handoffCode: string;
      reused: boolean;
    }
  | { status: "existing_order"; orderId: string; handoffCode: string }
  | { status: "needs_review"; orderId: string; handoffCode: string }
  | { status: "unconfigured" }
  | { status: "failed"; message: string };

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    if (COMING_SOON) return { status: "failed", message: COMING_SOON_MESSAGE };
    const config = readConfig(data.location);
    if (
      !mayCreateCustomerOrder({
        location: data.location,
        fulfilment: data.fulfilment,
        comingSoon: COMING_SOON,
        kitchenConfigured: config !== null,
        checkoutApproval: process.env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"],
      }) ||
      !config
    ) {
      return { status: "unconfigured" };
    }

    const checkoutClient = checkoutServerClient(config);
    if (!checkoutClient) return { status: "unconfigured" };

    // A short-lived signed estimate is not sufficient by itself. Re-read
    // the live Dishbee catalogue, serviceability, and delivery policy here
    // and refuse a changed bill before creating any pending order.
    if (data.fulfilment === "dinein") {
      return { status: "failed", message: "This MealDeck fulfilment is not available." };
    }
    const request: QuoteRequest = {
      location: data.location,
      fulfilment: data.fulfilment,
      postcode: data.customer.postcode,
      lines: data.lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        modifierIds: line.modifiers.map((option) => option.id),
      })),
    };
    const { verifyMealDeckQuote, matchesCurrentDishbeeAmounts } =
      await import("../server/mealdeck-quote");
    const verified = verifyMealDeckQuote({
      token: data.quoteToken,
      binding: {
        tenantId: config.tenantId,
        locationId: config.locationId,
        location: data.location,
        fulfilment: data.fulfilment,
        postcode: data.customer.postcode,
        lines: request.lines,
      },
      secret: process.env["MEALDECK_QUOTE_SIGNING_SECRET"],
      nowMs: Date.now(),
    });
    if (!verified.valid)
      return {
        status: "failed",
        message: "Your price estimate has expired or changed. Refresh your basket.",
      };
    const current = await readCurrentDishbeeQuote(config, request);
    if (!current.ready || !matchesCurrentDishbeeAmounts(verified.amounts, current.amounts)) {
      return {
        status: "failed",
        message: "Your kitchen, menu or delivery quote changed. Refresh your basket to continue.",
      };
    }

    // The legacy Dishbee public RPC still accepts p_delivery_pence. Only
    // Dishbee may calculate the configured fee. The database price guard in
    // draft Dishbee PR #83 and a dedicated Adyen session MUST be staged and
    // approved before the independent checkout release gate is enabled.

    try {
      const { data: rows, error } = await checkoutClient.rpc(
        "create_mealdeck_checkout_order_once",
        {
          p_attempt_id: data.attemptId,
          p_tenant: config.tenantId,
          p_location: config.locationId,
          p_fulfilment: data.fulfilment,
          p_customer_name: data.customer.name,
          p_customer_phone: data.customer.phone,
          p_lines: data.lines,
          p_delivery_pence: 0,
          p_address:
            data.fulfilment === "delivery" ? data.customer : { postcode: data.customer.postcode },
          p_vehicle_registration:
            data.fulfilment === "curbside"
              ? `${data.customer.carMake} · ${data.customer.vehicleRegistration}`
              : null,
        },
      );

      if (error) throw new Error(error.message);

      const receipt = parseDishbeeCheckoutAttemptReceipt(rows);
      if (!receipt) throw new Error("dishbee_checkout_receipt_invalid");
      if (receipt.kind === "existing_order" || receipt.kind === "needs_support") {
        return {
          status: receipt.kind === "existing_order" ? "existing_order" : "needs_review",
          orderId: receipt.orderId,
          handoffCode: receipt.handoffCode,
        };
      }
      return {
        status: "payment_required",
        orderId: receipt.orderId,
        handoffCode: receipt.handoffCode,
        reused: receipt.replayed,
      };
    } catch {
      // Never log raw customer data, provider errors, tenant credentials or
      // SQL exception messages from this payment-adjacent request.
      console.error("Dishbee idempotent checkout unavailable");
      return {
        status: "failed",
        message:
          "We couldn't create the order through the secure kitchen system. Please try again or contact support.",
      };
    }
  });

export type OrderTrackingResult =
  | {
      found: true;
      orderStatus: string;
      fulfilment: string;
      passStatus?: string | undefined;
      deliveryStatus?: string | undefined;
      trackingUrl?: string | undefined;
      updatedAt?: string | undefined;
      createdAt?: string | undefined;
      observedAt?: string | undefined;
    }
  | {
      found: false;
      message: string;
      reason?: "not_found" | "unavailable" | "forbidden" | "closed" | undefined;
    };

export const getOrderTracking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        handoffCode: z
          .string()
          .trim()
          .regex(/^\d{4}$/),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<OrderTrackingResult> => {
    // The route is hidden during Coming Soon, but the server function also
    // needs an explicit gate: a direct POST must not bypass the UI state.
    if (COMING_SOON)
      return {
        found: false,
        message: "MealDeck live tracking is not open yet.",
        reason: "closed",
      };
    const base = readBase();
    if (!base) {
      return {
        found: false,
        message: "Live order tracking is not available yet.",
        reason: "closed",
      };
    }

    try {
      const client = dishbeeClient(base);
      let {
        data: rows,
        error,
        status,
      } = await client.rpc("public_mealdeck_order_tracking_v2", {
        p_order: data.orderId,
        p_handoff_code: data.handoffCode,
      });

      // Only downgrade to the legacy, less detailed RPC when v2 is truly
      // missing. Permission, network and database failures must not silently
      // show stale or weaker tracking evidence.
      if (error && (error.code === "PGRST202" || error.code === "42883")) {
        const fallback = await client.rpc("public_mealdeck_order_tracking", {
          p_order: data.orderId,
          p_handoff_code: data.handoffCode,
        });
        rows = fallback.data;
        error = fallback.error;
        status = fallback.status;
      }

      if (error) {
        const temporarilyUnavailable = status === 0 || (status >= 500 && status < 600);
        return {
          found: false,
          reason: temporarilyUnavailable ? "unavailable" : "forbidden",
          message: temporarilyUnavailable
            ? "Order tracking is temporarily unavailable. Please try again."
            : "We couldn’t verify access to that order. Check the reference and handoff code.",
        };
      }
      // Unexpected multi-row or malformed replies fail closed instead of
      // exposing a possibly unrelated customer's order record.
      const parsed = parseMealDeckTrackingReply(rows);
      if (parsed.kind === "invalid") {
        throw new Error("dishbee_tracking_contract_invalid");
      }
      if (parsed.kind === "not_found") {
        return {
          found: false,
          message: "We couldn't find an order with that reference and handoff code.",
          reason: "not_found",
        };
      }
      const row = parsed.row;

      return {
        found: true,
        orderStatus: row.orderStatus,
        fulfilment: row.fulfilment,
        passStatus: row.passStatus,
        deliveryStatus: row.deliveryStatus,
        // Never expose arbitrary provider-supplied destinations to customers.
        trackingUrl:
          row.fulfilment === "delivery"
            ? (safeCourierTrackingUrl(
                row.trackingUrlCandidate,
                process.env["MEALDECK_TRACKING_ALLOWED_HOSTS"],
              ) ?? undefined)
            : undefined,
        updatedAt: row.updatedAt,
        // Placement and update times have different meanings. Legacy RPCs may
        // omit created_at; never substitute the latest update as order time.
        createdAt: row.createdAt,
        observedAt: new Date().toISOString(),
      };
    } catch {
      // Unexpected contract failures must clear any prior displayed order;
      // only explicit transport/server outages may retain a labelled stale view.
      console.error("MealDeck order tracking unavailable");
      return {
        found: false,
        message: "Order tracking is temporarily unavailable. Please try again.",
      };
    }
  });
