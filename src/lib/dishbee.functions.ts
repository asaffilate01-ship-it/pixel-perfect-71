import { COMING_SOON, COMING_SOON_MESSAGE } from "./launch-status";
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
  const url = process.env["DISHBEE_SUPABASE_URL"];
  const anonKey = process.env["DISHBEE_SUPABASE_ANON_KEY"];
  return url && anonKey ? { url, anonKey } : null;
}

function readConfig(location: LocationKey): DishbeeConfig | null {
  const base = readBase();
  const prefix = location === "luton" ? "MEALDECK_LUTON" : "MEALDECK_STALBANS";
  const tenantId = process.env[`${prefix}_TENANT_ID`];
  const locationId = process.env[`${prefix}_LOCATION_ID`];
  if (!base || !tenantId || !locationId) return null;
  return { ...base, tenantId, locationId };
}

function dishbeeClient(config: { url: string; anonKey: string }) {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false },
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
    if (!base) return fallback();

    try {
      const { data: rows, error } = await dishbeeClient(base).rpc(
        "public_mealdeck_serviceability",
        {
          p_postcode: data.postcode,
          p_fulfilment: data.fulfilment,
        },
      );
      if (error) throw new Error(error.message);

      const row = (Array.isArray(rows) ? rows[0] : rows) as
        | Record<string, unknown>
        | null;

      if (!row || !row["served"] || !row["location_id"]) {
        const sample = resolveSampleServiceability(
          data.postcode,
          data.fulfilment,
        );
        return {
          served: false,
          message: row?.["message"]?.toString() ?? sample.message,
          alternativeFulfilments: sample.alternativeFulfilments,
        };
      }

      const town = String(
        row["town"] ?? row["location_name"] ?? "",
      ).toLowerCase();
      const normalisedPostcode = data.postcode
        .toUpperCase()
        .replace(/\s+/g, "");

      const location: LocationKey =
        town.includes("albans") || normalisedPostcode.startsWith("AL")
          ? "stalbans"
          : "luton";

      return {
        served: true,
        location,
        channelOpen: Boolean(row["channel_open"]),
        message:
          row["message"]?.toString() ??
          `MealDeck ${location === "stalbans" ? "St Albans" : "Luton"} serves your area.`,
      };
    } catch (error) {
      console.error("Dishbee serviceability failed", error);
      return fallback();
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
    const config = readConfig(data.location);

    if (!config) {
      return {
        source: "sample",
        channelOpen: sampleLocationOpen(data.location),
        items: sampleMenu(data.location),
        notice:
          "Showing a preview menu while live ordering is unavailable.",
      };
    }

    try {
      const client=dishbeeClient(config);
      let legacyCatalogue=false;
      let {data:rows,error}=await client.rpc(
        "public_mealdeck_catalogue",
        {
          p_tenant:config.tenantId,
          p_location:config.locationId,
        },
      );

      // Backward-compatible fallback during staggered deployments.
      if(error){
        legacyCatalogue=true;
        const fallback=await client.rpc(
          "public_location_catalogue",
          {
            p_tenant:config.tenantId,
            p_location:config.locationId,
            p_channel:"mealdeck",
          },
        );
        rows=fallback.data;
        error=fallback.error;
      }

      if(error)throw new Error(error.message);

      const list=(rows??[]) as Array<Record<string,unknown>>;

      return {
        source:legacyCatalogue?"sample":"live",
        channelOpen:list.length?Boolean(list[0]!["channel_open"]):false,
        notice:legacyCatalogue
          ?"The live menu is updating. Checkout is temporarily disabled."
          :undefined,
        items:list.map((row)=>{
          const groups=Array.isArray(row["modifier_groups"])
            ? (row["modifier_groups"] as Array<Record<string,unknown>>).map((group)=>({
                id:String(group["id"]),
                name:String(group["name"]??"Options"),
                minSelect:Number(group["minSelect"]??0),
                maxSelect:Number(group["maxSelect"]??1),
                options:Array.isArray(group["options"])
                  ? (group["options"] as Array<Record<string,unknown>>).map((option)=>({
                      id:String(option["id"]),
                      name:String(option["name"]),
                      priceDeltaPence:Number(option["priceDeltaPence"]??0),
                    }))
                  : [],
              }))
            : [];

          const item:MenuItem={
            id:String(row["item_id"]),
            brandId:frontendBrandId(row),
            category:String(row["category_name"]??"Menu"),
            name:String(row["item_name"]),
            pricePence:Number(row["price_pence"]??0),
            imageUrl:row["image_url"]?String(row["image_url"]):null,
            allergens:Array.isArray(row["allergens"])?row["allergens"].map(String):[],
            hasModifiers:groups.length>0,
            modifierGroups:groups,
          };

          if(row["description"])item.description=String(row["description"]);
          return item;
        }),
      };
    } catch (error) {
      console.error("Dishbee catalogue request failed", error);
      return {
        source: "sample",
        channelOpen: sampleLocationOpen(data.location),
        items: sampleMenu(data.location),
        notice:
          "The live menu is temporarily unavailable, so a preview menu is shown.",
      };
    }
  });

const orderSchema = z
  .object({
    location: locationSchema,
    fulfilment: fulfilmentSchema,
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
    deliveryPence: z.number().int().min(0).max(5000),
    customer: z.object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(5).max(40),
      email: z
        .string()
        .email()
        .max(160)
        .optional()
        .or(z.literal("")),
      vehicleRegistration: z
        .string()
        .trim()
        .max(12)
        .optional()
        .or(z.literal("")),
      carMake: z
        .string()
        .trim()
        .max(60)
        .optional()
        .or(z.literal("")),
      address1: z
        .string()
        .max(200)
        .optional()
        .or(z.literal("")),
      city: z
        .string()
        .max(120)
        .optional()
        .or(z.literal("")),
      postcode: z
        .string()
        .trim()
        .min(2)
        .max(12),
      notes: z
        .string()
        .max(400)
        .optional()
        .or(z.literal("")),
    }),
  })
  .superRefine((value, ctx) => {
    if (
      value.location === "stalbans" &&
      value.fulfilment !== "delivery"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "St Albans is delivery only",
      });
    }

    if (
      value.fulfilment === "delivery" &&
      (!value.customer.address1 || !value.customer.postcode)
    ) {
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
    }
  | { status: "unconfigured" }
  | { status: "failed"; message: string };

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    if (COMING_SOON) return { status: "failed", message: COMING_SOON_MESSAGE };
    const config = readConfig(data.location);

    if (!config) {
      return { status: "unconfigured" };
    }

    const deliveryPence =
      data.fulfilment === "delivery"
        ? data.deliveryPence
        : 0;

    try {
      const { data: rows, error } = await dishbeeClient(config).rpc(
        "create_mealdeck_checkout_order",
        {
          p_tenant: config.tenantId,
          p_location: config.locationId,
          p_fulfilment: data.fulfilment,
          p_customer_name: data.customer.name,
          p_customer_phone: data.customer.phone,
          p_lines: data.lines,
          p_delivery_pence: deliveryPence,
          p_address:
            data.fulfilment === "delivery"
              ? data.customer
              : { postcode: data.customer.postcode },
          p_vehicle_registration:
            data.fulfilment === "curbside"
              ? `${data.customer.carMake} · ${data.customer.vehicleRegistration}`
              : null,
        },
      );

      if (error) throw new Error(error.message);

      const row = (Array.isArray(rows) ? rows[0] : rows) as
        | Record<string, unknown>
        | null;

      const orderId = String(row?.["order_id"] ?? "");

      if (!orderId) {
        throw new Error("Order reference not returned");
      }

      return {
        status: "payment_required",
        orderId,
        handoffCode: String(row?.["handoff_code"] ?? ""),
      };
    } catch (error) {
      console.error("Dishbee checkout failed", error);
      return {
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "We couldn't create that order. Please try again.",
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
    }
  | { found: false; message: string };

export const getOrderTracking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        handoffCode: z.string().trim().regex(/^\d{4}$/),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<OrderTrackingResult> => {
    const base = readBase();
    if (!base) {
      return {
        found: false,
        message: "Live order tracking is not available yet.",
      };
    }

    try {
      const client=dishbeeClient(base);
      let {data:rows,error}=await client.rpc(
        "public_mealdeck_order_tracking_v2",
        {
          p_order:data.orderId,
          p_handoff_code:data.handoffCode,
        },
      );

      if(error){
        const fallback=await client.rpc(
          "public_mealdeck_order_tracking",
          {
            p_order:data.orderId,
            p_handoff_code:data.handoffCode,
          },
        );
        rows=fallback.data;
        error=fallback.error;
      }

      if(error)throw new Error(error.message);

      const row=((rows??[]) as Array<Record<string,unknown>>)[0];
      if (!row) {
        return {
          found: false,
          message: "We couldn't find an order with that reference and handoff code.",
        };
      }

      return {
        found: true,
        orderStatus: String(row["order_status"] ?? ""),
        fulfilment: String(row["fulfilment"] ?? ""),
        passStatus: row["pass_status"]
          ? String(row["pass_status"])
          : undefined,
        deliveryStatus: row["delivery_status"]
          ? String(row["delivery_status"])
          : undefined,
        trackingUrl: row["tracking_url"]
          ? String(row["tracking_url"])
          : undefined,
        updatedAt: row["updated_at"]
          ? String(row["updated_at"])
          : undefined,
      };
    } catch (error) {
      console.error("Dishbee order tracking failed", error);
      return {
        found: false,
        message: "Order tracking is temporarily unavailable. Please try again.",
      };
    }
  });
