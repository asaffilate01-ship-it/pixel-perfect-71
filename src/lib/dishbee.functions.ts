import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  addonBrandIds,
  allBrandIdsForLocation,
  locationByKey,
  lutonPrimaryBrandIds,
  sampleMenu,
  type FulfilmentType,
  type LocationKey,
  type MenuItem,
  type SelectedModifier,
} from "./mealdeck";

const locationSchema = z.enum(["luton", "stalbans"]);
const fulfilmentSchema = z.enum(["delivery", "pickup", "curbside"]);

type DishbeeBaseConfig = {
  url: string;
  anonKey: string;
};

type DishbeeConfig = DishbeeBaseConfig & {
  tenantId: string;
  locationId: string;
};

function readBaseConfig(): DishbeeBaseConfig | null {
  const url = process.env["DISHBEE_SUPABASE_URL"];
  const anonKey = process.env["DISHBEE_SUPABASE_ANON_KEY"];
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function readConfig(
  location: LocationKey,
  tenantOverride?: string,
  locationOverride?: string,
): DishbeeConfig | null {
  const base = readBaseConfig();
  if (!base) return null;
  const prefix = location === "luton" ? "MEALDECK_LUTON" : "MEALDECK_STALBANS";
  const tenantId = tenantOverride || process.env[`${prefix}_TENANT_ID`];
  const locationId = locationOverride || process.env[`${prefix}_LOCATION_ID`];
  if (!tenantId || !locationId) return null;
  return { ...base, tenantId, locationId };
}

function dishbeeClient(config: DishbeeBaseConfig) {
  return createClient(config.url, config.anonKey, { auth: { persistSession: false } });
}

function normalisePostcode(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").trim();
}

function sampleStAlbansOpen(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    const weekdayOpen = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
    const minutes = hour * 60 + minute;
    return weekdayOpen && minutes >= 9 * 60 && minutes < 16 * 60;
  } catch {
    return true;
  }
}

export type ServiceabilityResult = {
  source: "live" | "sample";
  served: boolean;
  location?: LocationKey;
  tenantId?: string;
  locationId?: string;
  channelOpen: boolean;
  primaryBrandIds: string[];
  addonBrandIds: string[];
  message: string;
  hoursLabel?: string;
  alternativeFulfilments?: FulfilmentType[];
};

function sampleServiceability(
  postcode: string,
  fulfilment: FulfilmentType,
): ServiceabilityResult {
  const pc = normalisePostcode(postcode);

  if (pc.startsWith("LU")) {
    return {
      source: "sample",
      served: true,
      location: "luton",
      channelOpen: true,
      primaryBrandIds: lutonPrimaryBrandIds,
      addonBrandIds,
      message: "Great news — MealDeck Luton serves your area.",
      hoursLabel: locationByKey("luton").hoursLabel,
    };
  }

  if (pc.startsWith("AL")) {
    if (fulfilment !== "delivery") {
      return {
        source: "sample",
        served: false,
        location: "stalbans",
        channelOpen: sampleStAlbansOpen(),
        primaryBrandIds: locationByKey("stalbans").primaryBrandIds,
        addonBrandIds,
        alternativeFulfilments: ["delivery"],
        message: "MealDeck St Albans currently offers delivery only. Choose Delivery to continue.",
        hoursLabel: locationByKey("stalbans").hoursLabel,
      };
    }
    return {
      source: "sample",
      served: true,
      location: "stalbans",
      channelOpen: sampleStAlbansOpen(),
      primaryBrandIds: locationByKey("stalbans").primaryBrandIds,
      addonBrandIds,
      message: "Great news — MealDeck St Albans serves your area.",
      hoursLabel: locationByKey("stalbans").hoursLabel,
    };
  }

  const manchester =
    pc.startsWith("M") || pc.startsWith("OL") || pc.startsWith("SK");
  return {
    source: "sample",
    served: false,
    channelOpen: false,
    primaryBrandIds: [],
    addonBrandIds: [],
    message: manchester
      ? "Sorry, MealDeck is not in Manchester yet — we are coming soon."
      : "Sorry, MealDeck does not serve your area yet. We are expanding quickly — please check back soon.",
  };
}

function mapLiveLocation(
  name: string,
  town: string,
  postcode: string,
): LocationKey | undefined {
  const haystack = `${name} ${town}`.toLowerCase();
  if (haystack.includes("albans")) return "stalbans";
  if (haystack.includes("luton")) return "luton";
  const pc = normalisePostcode(postcode);
  if (pc.startsWith("AL")) return "stalbans";
  if (pc.startsWith("LU")) return "luton";
  return undefined;
}

export const resolveServiceArea = createServerFn({ method: "GET" })
  .inputValidator((input: { postcode: string; fulfilment: FulfilmentType }) =>
    z
      .object({
        postcode: z.string().min(2).max(12),
        fulfilment: fulfilmentSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ServiceabilityResult> => {
    const base = readBaseConfig();
    if (!base) return sampleServiceability(data.postcode, data.fulfilment);

    try {
      const { data: rows, error } = await dishbeeClient(base).rpc(
        "public_mealdeck_serviceability",
        {
          p_postcode: data.postcode,
          p_fulfilment: data.fulfilment,
        },
      );
      if (error) throw new Error(error.message);

      const row = ((rows ?? []) as Array<Record<string, unknown>>)[0];
      if (!row || !Boolean(row["served"])) {
        return {
          source: "live",
          served: false,
          channelOpen: false,
          primaryBrandIds: [],
          addonBrandIds: [],
          message: String(
            row?.["message"] ??
              "Sorry, MealDeck does not serve your area yet. We are expanding quickly — please check back soon.",
          ),
        };
      }

      const locationName = String(row["location_name"] ?? "");
      const town = String(row["town"] ?? "");
      const location = mapLiveLocation(locationName, town, data.postcode);
      if (!location) return sampleServiceability(data.postcode, data.fulfilment);

      const primary = Array.isArray(row["primary_brands"])
        ? (row["primary_brands"] as Array<Record<string, unknown>>)
            .map((brand) => String(brand["slug"] ?? brand["brandId"] ?? ""))
            .filter(Boolean)
        : locationByKey(location).primaryBrandIds;

      const addons = Array.isArray(row["addon_brands"])
        ? (row["addon_brands"] as Array<Record<string, unknown>>)
            .map((brand) => String(brand["slug"] ?? brand["brandId"] ?? ""))
            .filter(Boolean)
        : locationByKey(location).addonBrandIds;

      return {
        source: "live",
        served: true,
        location,
        tenantId: row["tenant_id"] ? String(row["tenant_id"]) : undefined,
        locationId: row["location_id"] ? String(row["location_id"]) : undefined,
        channelOpen: Boolean(row["channel_open"]),
        primaryBrandIds: primary,
        addonBrandIds: addons,
        message: String(row["message"] ?? "MealDeck serves your area."),
        hoursLabel: locationByKey(location).hoursLabel,
      };
    } catch (error) {
      console.error("Dishbee serviceability request failed", error);
      return sampleServiceability(data.postcode, data.fulfilment);
    }
  });

export type CatalogueResult = {
  source: "live" | "sample";
  channelOpen: boolean;
  items: MenuItem[];
  notice?: string;
};

export const getCatalogue = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      location: LocationKey;
      tenantId?: string;
      locationId?: string;
    }) =>
      z
        .object({
          location: locationSchema,
          tenantId: z.string().uuid().optional(),
          locationId: z.string().uuid().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<CatalogueResult> => {
    const config = readConfig(data.location, data.tenantId, data.locationId);
    if (!config) {
      return {
        source: "sample",
        channelOpen: data.location === "stalbans" ? sampleStAlbansOpen() : true,
        items: sampleMenu(data.location),
        notice: "Showing a sample menu until the live kitchen service is connected.",
      };
    }

    try {
      const { data: rows, error } = await dishbeeClient(config).rpc(
        "public_location_catalogue",
        {
          p_tenant: config.tenantId,
          p_location: config.locationId,
          p_channel: "mealdeck",
        },
      );
      if (error) throw new Error(error.message);

      const list = (rows ?? []) as Array<Record<string, unknown>>;
      return {
        source: "live",
        channelOpen: list.length ? Boolean(list[0]!["channel_open"]) : false,
        items: list
          .map((row) => ({
            id: String(row["item_id"]),
            brandId: String(row["brand_id"] ?? "unbranded"),
            category: String(row["category_name"] ?? "Menu"),
            name: String(row["item_name"]),
            description: row["description"] ? String(row["description"]) : undefined,
            pricePence: Number(row["price_pence"] ?? 0),
            imageUrl: row["image_url"] ? String(row["image_url"]) : null,
            allergens: Array.isArray(row["allergens"])
              ? row["allergens"].map(String)
              : [],
          }))
          .filter((item) => allBrandIdsForLocation(data.location).includes(item.brandId)),
      };
    } catch (error) {
      console.error("Dishbee catalogue request failed", error);
      return {
        source: "sample",
        channelOpen: data.location === "stalbans" ? sampleStAlbansOpen() : true,
        items: sampleMenu(data.location),
        notice: "The live menu is temporarily unavailable, so a sample menu is shown.",
      };
    }
  });

const modifierSchema = z.object({
  groupId: z.string().max(100),
  groupName: z.string().max(120),
  id: z.string().max(100),
  name: z.string().max(120),
  priceDeltaPence: z.number().int().min(0).max(5000),
});

const orderSchema = z
  .object({
    location: locationSchema,
    tenantId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    fulfilment: fulfilmentSchema,
    lines: z
      .array(
        z.object({
          itemId: z.string().min(1),
          quantity: z.number().int().min(1).max(50),
          modifiers: z.array(modifierSchema).max(20).default([]),
        }),
      )
      .min(1)
      .max(60),
    deliveryPence: z.number().int().min(0).max(5000),
    customer: z.object({
      name: z.string().min(1).max(120),
      phone: z.string().min(5).max(40),
      email: z.string().email().max(160).optional().or(z.literal("")),
      address1: z.string().max(200).optional().or(z.literal("")),
      city: z.string().max(120).optional().or(z.literal("")),
      postcode: z.string().min(2).max(12),
      vehicleRegistration: z.string().max(20).optional().or(z.literal("")),
      notes: z.string().max(400).optional().or(z.literal("")),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.fulfilment === "delivery") {
      if (!value.customer.address1?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["customer", "address1"],
          message: "Delivery address is required.",
        });
      }
      if (!value.customer.city?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["customer", "city"],
          message: "Town or city is required.",
        });
      }
    }
    if (value.fulfilment === "curbside" && !value.customer.vehicleRegistration?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["customer", "vehicleRegistration"],
        message: "Vehicle registration is required for kerbside.",
      });
    }
  });

export type PlaceOrderResult =
  | { status: "payment_required"; orderId: string; handoffCode?: string }
  | { status: "unconfigured" }
  | { status: "failed"; message: string };

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    const config = readConfig(data.location, data.tenantId, data.locationId);
    if (!config) return { status: "unconfigured" };

    try {
      const address =
        data.fulfilment === "delivery"
          ? {
              name: data.customer.name,
              phone: data.customer.phone,
              email: data.customer.email || null,
              address_line1: data.customer.address1,
              city: data.customer.city,
              postcode: data.customer.postcode,
              notes: data.customer.notes || null,
            }
          : { postcode: data.customer.postcode };

      const { data: rows, error } = await dishbeeClient(config).rpc(
        "create_mealdeck_checkout_order",
        {
          p_tenant: config.tenantId,
          p_location: config.locationId,
          p_fulfilment: data.fulfilment,
          p_customer_name: data.customer.name,
          p_customer_phone: data.customer.phone,
          p_lines: data.lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            modifiers: line.modifiers,
          })),
          p_delivery_pence: data.deliveryPence,
          p_address: address,
          p_vehicle_registration:
            data.fulfilment === "curbside"
              ? data.customer.vehicleRegistration?.toUpperCase().trim() || null
              : null,
        },
      );
      if (error) throw new Error(error.message);

      const result = Array.isArray(rows)
        ? (rows[0] as Record<string, unknown> | undefined)
        : (rows as Record<string, unknown> | null);

      const orderId = String(result?.["order_id"] ?? "");
      if (!orderId) throw new Error("Order reference was not returned.");

      return {
        status: "payment_required",
        orderId,
        handoffCode: result?.["handoff_code"]
          ? String(result["handoff_code"])
          : undefined,
      };
    } catch (error) {
      console.error("Dishbee checkout failed", error);
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "Checkout failed",
      };
    }
  });
