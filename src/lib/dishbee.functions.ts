import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { sampleMenu, type LocationKey, type MenuItem } from "./mealdeck";

const locationSchema = z.enum(["luton", "stalbans"]);

type DishbeeConfig = {
  url: string;
  anonKey: string;
  tenantId: string;
  locationId: string;
};

function readConfig(location: LocationKey): DishbeeConfig | null {
  const url = process.env["DISHBEE_SUPABASE_URL"];
  const anonKey = process.env["DISHBEE_SUPABASE_ANON_KEY"];
  const prefix = location === "luton" ? "MEALDECK_LUTON" : "MEALDECK_STALBANS";
  const tenantId = process.env[`${prefix}_TENANT_ID`];
  const locationId = process.env[`${prefix}_LOCATION_ID`];
  if (!url || !anonKey || !tenantId || !locationId) return null;
  return { url, anonKey, tenantId, locationId };
}

function dishbeeClient(config: DishbeeConfig) {
  return createClient(config.url, config.anonKey, { auth: { persistSession: false } });
}

export type CatalogueResult = {
  source: "live" | "sample";
  channelOpen: boolean;
  items: MenuItem[];
  notice?: string;
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
        items: list.map((row) => ({
          id: String(row["item_id"]),
          brandId: String(row["brand_id"] ?? "unbranded"),
          category: String(row["category_name"] ?? "Menu"),
          name: String(row["item_name"]),
          description: row["description"] ? String(row["description"]) : undefined,
          pricePence: Number(row["price_pence"] ?? 0),
          imageUrl: row["image_url"] ? String(row["image_url"]) : null,
          allergens: Array.isArray(row["allergens"]) ? row["allergens"].map(String) : [],
        })),
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

const orderSchema = z.object({
  location: locationSchema,
  lines: z
    .array(z.object({ itemId: z.string().min(1), quantity: z.number().int().min(1).max(50) }))
    .min(1)
    .max(60),
  deliveryPence: z.number().int().min(0).max(5000),
  customer: z.object({
    name: z.string().min(1).max(120),
    phone: z.string().min(5).max(40),
    email: z.string().email().max(160).optional().or(z.literal("")),
    address1: z.string().min(1).max(200),
    city: z.string().min(1).max(120),
    postcode: z.string().min(3).max(12),
    notes: z.string().max(400).optional().or(z.literal("")),
  }),
});

export type PlaceOrderResult =
  | { status: "placed"; orderId: string }
  | { status: "unconfigured" }
  | { status: "failed"; message: string };

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    const config = readConfig(data.location);
    if (!config) return { status: "unconfigured" };

    try {
      const { data: orderId, error } = await dishbeeClient(config).rpc(
        "create_channel_checkout_order",
        {
          p_tenant: config.tenantId,
          p_location: config.locationId,
          p_channel: "mealdeck",
          p_fulfilment: "delivery",
          p_lines: data.lines,
          p_delivery_pence: data.deliveryPence,
          p_address: data.customer,
          p_vehicle: null,
        },
      );
      if (error) throw new Error(error.message);
      return { status: "placed", orderId: String(orderId) };
    } catch (error) {
      console.error("Dishbee checkout failed", error);
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "Checkout failed",
      };
    }
  });
