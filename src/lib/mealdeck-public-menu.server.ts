import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { launchMenuBrands } from "./launch-menu-catalogue";
import { checkoutModifierId } from "./mealdeck-checkout-selection";
import type { MealDeckPublicMenuSnapshot } from "./mealdeck-public-menu";
import {
  readMealDeckCheckoutServerKey,
  readMealDeckRuntimeConfig,
  type MealDeckRuntimeEnv,
} from "./mealdeck-runtime-config";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const pence = z.number().int().min(0).max(1_000_000);
const canonicalOption = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  pricePence: pence,
  available: z.boolean(),
});
const canonicalSnapshot = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.uuid(),
  locationId: z.uuid(),
  checkedAt: z
    .string()
    .max(64)
    .refine((value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))),
  items: z
    .array(
      z.object({
        sku: z.string().min(1).max(180),
        brandSlug: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(140),
        description: z.string().max(2000).nullable(),
        pricePence: pence,
        requiredGroupIds: z.array(z.uuid()).max(100),
        options: z.array(canonicalOption).max(256),
      }),
    )
    .max(256),
  replacementOptions: z.array(canonicalOption).max(128),
});

/** Only source-reviewed SKUs are requested. Browser input never selects scope. */
export function publicMenuBindings(tenantId: string) {
  const items = launchMenuBrands.flatMap((brand) =>
    brand.sections.flatMap((section) =>
      section.items.map((item) => {
        const options = new Map<string, { id: string; groupId: string; allowed: boolean }>();
        for (const group of brand.optionGroups.filter((group) =>
          item.optionGroupIds.includes(group.id),
        )) {
          for (const option of group.options)
            options.set(checkoutModifierId(tenantId, "option", option.id), {
              id: option.id,
              groupId: checkoutModifierId(tenantId, "group", group.id),
              allowed: option.available !== false,
            });
        }
        for (const variant of item.priceVariants ?? [])
          options.set(checkoutModifierId(tenantId, "option", variant.optionId), {
            id: variant.optionId,
            groupId: checkoutModifierId(tenantId, "group", variant.groupId),
            allowed: true,
          });
        const slot =
          brand.id === "loadd" && ["loaded-fries", "loaded-mac-cheese"].includes(section.id)
            ? "side"
            : brand.id === "moktl" && section.id === "mocktail-lounge"
              ? "drink"
              : null;
        const replacementGroup = slot ? `cross-${slot}-replacement` : null;
        return {
          sku: item.id,
          brandId: brand.id,
          options,
          replacement: replacementGroup
            ? {
                id: checkoutModifierId(tenantId, "option", `${replacementGroup}-${item.id}`),
                groupId: checkoutModifierId(tenantId, "group", replacementGroup),
              }
            : null,
        };
      }),
    ),
  );
  return {
    items,
    skus: items.map((item) => item.sku),
    replacementOptionIds: items.flatMap((item) => (item.replacement ? [item.replacement.id] : [])),
  };
}

/** Strip every database identifier and unreviewed field at the public boundary. */
export function projectPublicMenuSnapshot(
  value: unknown,
  scope: { tenantId: string; locationId: string },
): MealDeckPublicMenuSnapshot {
  const data = canonicalSnapshot.parse(value);
  if (
    data.tenantId !== scope.tenantId ||
    data.locationId !== scope.locationId ||
    new Set(data.items.map((item) => item.sku)).size !== data.items.length ||
    new Set(data.replacementOptions.map((option) => option.id)).size !==
      data.replacementOptions.length
  ) {
    throw new Error("mealdeck_public_menu_invalid_response");
  }
  const bindings = publicMenuBindings(scope.tenantId);
  const rows = new Map(data.items.map((item) => [item.sku, item]));
  const replacements = new Map(data.replacementOptions.map((option) => [option.id, option]));
  const items: MealDeckPublicMenuSnapshot["items"] = [];
  for (const binding of bindings.items) {
    const row = rows.get(binding.sku);
    if (!row || row.brandSlug !== binding.brandId) continue;
    if (new Set(row.options.map((option) => option.id)).size !== row.options.length)
      throw new Error("mealdeck_public_menu_invalid_response");
    const knownGroups = new Set([...binding.options.values()].map((option) => option.groupId));
    // An administrator-added required group cannot be silently omitted from a
    // customer form whose structure still comes from the reviewed source menu.
    if (row.requiredGroupIds.some((id) => !knownGroups.has(id))) continue;
    const options: MealDeckPublicMenuSnapshot["items"][number]["options"] = {};
    for (const option of row.options) {
      const source = binding.options.get(option.id);
      if (!source || source.groupId !== option.groupId) continue;
      options[source.id] = {
        pricePence: option.pricePence,
        available: source.allowed && option.available,
      };
    }
    const replacement = binding.replacement ? replacements.get(binding.replacement.id) : null;
    items.push({
      sku: binding.sku,
      name: row.name,
      description: row.description,
      pricePence: row.pricePence,
      options,
      replacementPricePence:
        replacement?.available && replacement.groupId === binding.replacement?.groupId
          ? replacement.pricePence
          : null,
    });
  }
  return { available: true, checkedAt: new Date(data.checkedAt).toISOString(), items };
}

export async function handlePublicMenuRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "GET")
    return Response.json(
      { available: false, reason: "method_not_allowed" },
      { status: 405, headers: { ...headers, Allow: "GET" } },
    );
  const config = readMealDeckRuntimeConfig(env, "luton");
  const key = config ? readMealDeckCheckoutServerKey(env, config) : null;
  if (!config || !key)
    return Response.json(
      { available: false, reason: "menu_unconfigured" },
      { status: 503, headers },
    );
  try {
    const client = createClient(config.url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetcher },
    });
    const bindings = publicMenuBindings(config.tenantId);
    const { data, error } = await client
      .rpc("mealdeck_public_launch_catalogue", {
        p_tenant: config.tenantId,
        p_location: config.locationId,
        p_skus: bindings.skus,
        p_replacement_options: bindings.replacementOptionIds,
      })
      .abortSignal(AbortSignal.timeout(8000));
    if (error) throw new Error("mealdeck_public_menu_unavailable");
    return Response.json(projectPublicMenuSnapshot(data, config), { headers });
  } catch {
    // Never return provider errors, credentials, table names or private scope.
    return Response.json(
      { available: false, reason: "menu_unavailable" },
      { status: 503, headers },
    );
  }
}
