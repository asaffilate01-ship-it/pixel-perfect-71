import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  resolveSampleServiceability,
  sampleMenu,
  type LocationKey,
  type MenuItem,
} from "./mealdeck";

const locationSchema = z.enum(["luton", "stalbans"]);
const fulfilmentSchema = z.enum(["delivery", "pickup", "curbside"]);

type DishbeeConfig = { url: string; anonKey: string; tenantId: string; locationId: string };

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
  return createClient(config.url, config.anonKey, { auth: { persistSession: false } });
}

export type ServiceabilityResult =
  | { served: true; location: LocationKey; channelOpen: boolean; message: string }
  | { served: false; message: string };

export const checkServiceability = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ postcode: z.string().trim().min(2).max(12), fulfilment: fulfilmentSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<ServiceabilityResult> => {
    const base = readBase();
    if (!base) {
      const r = resolveSampleServiceability(data.postcode, data.fulfilment);
      return r.locationKey
        ? { served: true, location: r.locationKey, channelOpen: true, message: r.message }
        : { served: false, message: r.message };
    }
    try {
      const { data: rows, error } = await dishbeeClient(base).rpc("public_mealdeck_serviceability", {
        p_postcode: data.postcode,
        p_fulfilment: data.fulfilment,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | null;
      if (!row || !row["served"] || !row["location_id"]) {
        return {
          served: false,
          message: row?.["message"] ? String(row["message"]) : "Sorry, MealDeck doesn't serve your area yet.",
        };
      }
      const town = String(row["town"] ?? row["location_name"] ?? "").toLowerCase();
      const location: LocationKey = town.includes("st albans") ? "stalbans" : "luton";
      return {
        served: true,
        location,
        channelOpen: Boolean(row["channel_open"]),
        message: row["message"] ? String(row["message"]) : `MealDeck ${location === "stalbans" ? "St Albans" : "Luton"} serves your area.`,
      };
    } catch (error) {
      console.error("Dishbee serviceability failed", error);
      return { served: false, message: "We couldn't check that postcode right now. Please try again." };
    }
  });

export type CatalogueResult = {
  source: "live" | "sample";
  channelOpen: boolean;
  items: MenuItem[];
  notice?: string;
};

export const getCatalogue = createServerFn({ method: "GET" })
  .inputValidator((input: { location: LocationKey }) => z.object({ location: locationSchema }).parse(input))
  .handler(async ({ data }): Promise<CatalogueResult> => {
    const config = readConfig(data.location);
    if (!config) {
      return {
        source: "sample",
        channelOpen: true,
        items: sampleMenu(data.location),
        notice: "Showing a sample menu until the live kitchen service is connected.",
      };
    }
    try {
      const { data: rows, error } = await dishbeeClient(config).rpc("public_location_catalogue", {
        p_tenant: config.tenantId,
        p_location: config.locationId,
        p_channel: "mealdeck",
      });
      if (error) throw new Error(error.message);
      const list = (rows ?? []) as Array<Record<string, unknown>>;
      return {
        source: "live",
        channelOpen: list.length ? Boolean(list[0]!["channel_open"]) : false,
        items: list.map((row) => {
          const item: MenuItem = {
            id: String(row["item_id"]),
            brandId: String(row["brand_id"] ?? "unbranded"),
            category: String(row["category_name"] ?? "Menu"),
            name: String(row["item_name"]),
            pricePence: Number(row["price_pence"] ?? 0),
            imageUrl: row["image_url"] ? String(row["image_url"]) : null,
            allergens: Array.isArray(row["allergens"]) ? row["allergens"].map(String) : [],
            hasModifiers: true,
          };
          if (row["description"]) item.description = String(row["description"]);
          return item;
        }),
      };
    } catch (error) {
      console.error("Dishbee catalogue request failed", error);
      return {
        source: "sample",
        channelOpen: true,
        items: sampleMenu(data.location),
        notice: "The live menu is temporarily unavailable, so a sample menu is shown.",
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
          modifiers: z.array(z.object({ name: z.string().max(80), priceDeltaPence: z.number().int() })).max(20),
        }),
      )
      .min(1)
      .max(60),
    deliveryPence: z.number().int().min(0).max(5000),
    customer: z.object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(5).max(40),
      email: z.string().email().max(160).optional().or(z.literal("")),
      vehicleRegistration: z.string().trim().max(12).optional().or(z.literal("")),
      address1: z.string().max(200).optional().or(z.literal("")),
      city: z.string().max(120).optional().or(z.literal("")),
      postcode: z.string().max(12).optional().or(z.literal("")),
      notes: z.string().max(400).optional().or(z.literal("")),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.location === "stalbans" && value.fulfilment !== "delivery")
      ctx.addIssue({ code: "custom", message: "St Albans is delivery only" });
    if (value.fulfilment === "delivery" && (!value.customer.address1 || !value.customer.postcode))
      ctx.addIssue({ code: "custom", message: "Delivery address required" });
    if (value.fulfilment === "curbside" && !value.customer.vehicleRegistration)
      ctx.addIssue({ code: "custom", message: "Vehicle registration required" });
  });

export type PlaceOrderResult =
  | { status: "placed"; orderId: string; handoffCode: string }
  | { status: "unconfigured" }
  | { status: "failed"; message: string };

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    const config = readConfig(data.location);
    if (!config) return { status: "unconfigured" };
    const deliveryPence = data.fulfilment === "delivery" ? data.deliveryPence : 0;
    try {
      const { data: rows, error } = await dishbeeClient(config).rpc("create_mealdeck_checkout_order", {
        p_tenant: config.tenantId,
        p_location: config.locationId,
        p_fulfilment: data.fulfilment,
        p_customer_name: data.customer.name,
        p_customer_phone: data.customer.phone,
        p_lines: data.lines,
        p_delivery_pence: deliveryPence,
        p_address: data.fulfilment === "delivery" ? data.customer : null,
        p_vehicle_registration: data.fulfilment === "curbside" ? data.customer.vehicleRegistration : null,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | null;
      return {
        status: "placed",
        orderId: String(row?.["order_id"] ?? ""),
        handoffCode: String(row?.["handoff_code"] ?? ""),
      };
    } catch (error) {
      console.error("Dishbee checkout failed", error);
      return { status: "failed", message: "We couldn't place that order. Please try again." };
    }
  });
