import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { launchMenuBrands } from "./launch-menu-catalogue";
import { checkoutModifierId } from "./mealdeck-checkout-selection";
import type { MealDeckPublicMenuSnapshot } from "./mealdeck-public-menu";
import { readMealDeckBackendConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  isMealDeckMilkcakePromotion,
  isPublicMilkcakePromotion,
} from "./mealdeck-milkcake-promotion";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const pence = z.number().int().min(0).max(1_000_000);
const milkcakePromotion = z
  .object({
    id: z.literal("sunday-milk-cake-20261108"),
    finalUnitPence: z.literal(99),
    regularUnitPence: z.literal(399),
    maximumQuantityPerOrder: z.literal(1),
    discountIncluded: z.literal(true),
    startsAt: z.string().max(64),
    endsAt: z.string().max(64),
  })
  .refine(isMealDeckMilkcakePromotion);
const canonicalOption = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  label: z.string().trim().min(1).max(140).optional(),
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
        categoryName: z.string().trim().min(1).max(140).optional(),
        name: z.string().trim().min(1).max(140),
        description: z.string().max(2000).nullable(),
        pricePence: pence,
        promotion: milkcakePromotion.optional(),
        requiredGroupIds: z.array(z.uuid()).max(100),
        options: z.array(canonicalOption).max(256),
      }),
    )
    .max(256),
  replacementOptions: z.array(canonicalOption).max(128),
});

const publicOption = z.object({
  label: z.string().trim().min(1).max(140).optional(),
  pricePence: pence,
  available: z.boolean(),
});
const publicSnapshot = z.object({
  available: z.literal(true),
  checkedAt: canonicalSnapshot.shape.checkedAt,
  items: z
    .array(
      z.object({
        sku: z.string().min(1).max(180),
        categoryName: z.string().trim().min(1).max(140).optional(),
        name: z.string().trim().min(1).max(140),
        description: z.string().max(2000).nullable(),
        pricePence: pence,
        promotion: milkcakePromotion.optional(),
        options: z
          .record(z.string().min(1).max(180), publicOption)
          .refine((options) => Object.keys(options).length <= 256),
        replacementPricePence: pence.nullable(),
        replacementLabel: z.string().trim().min(1).max(140).optional(),
      }),
    )
    .max(256),
});

/** The no-argument public RPC owns scope/publication; only reviewed presentation leaves this API. */
export function sanitizePublicMenuSnapshot(value: unknown): MealDeckPublicMenuSnapshot {
  const data = publicSnapshot.parse(value);
  if (new Set(data.items.map((row) => row.sku)).size !== data.items.length)
    throw new Error("mealdeck_public_menu_invalid_response");
  const sourceItems = new Map(
    launchMenuBrands.flatMap((brand) =>
      brand.sections.flatMap((section) =>
        section.items.map((item) => [item.id, { brand, section, item }] as const),
      ),
    ),
  );
  const items: MealDeckPublicMenuSnapshot["items"] = [];
  for (const row of data.items) {
    if (
      row.promotion !== undefined &&
      !isPublicMilkcakePromotion(row.promotion, row.sku, row.pricePence, data.checkedAt)
    )
      throw new Error("mealdeck_public_menu_invalid_response");
    const source = sourceItems.get(row.sku);
    if (!source) continue;
    const allowedOptions = new Map(
      source.brand.optionGroups
        .filter((group) => source.item.optionGroupIds.includes(group.id))
        .flatMap((group) =>
          group.options.map((option) => [option.id, option.available !== false] as const),
        ),
    );
    for (const variant of source.item.priceVariants ?? [])
      allowedOptions.set(variant.optionId, true);
    const options: MealDeckPublicMenuSnapshot["items"][number]["options"] = {};
    for (const [id, option] of Object.entries(row.options)) {
      if (!allowedOptions.has(id)) continue;
      options[id] = {
        pricePence: option.pricePence,
        available: allowedOptions.get(id) === true && option.available,
        ...(option.label === undefined ? {} : { label: option.label }),
      };
    }
    const replacementAllowed =
      (source.brand.id === "loadd" &&
        ["loaded-fries", "loaded-mac-cheese"].includes(source.section.id)) ||
      (source.brand.id === "moktl" && source.section.id === "mocktail-lounge");
    items.push({
      sku: row.sku,
      ...(row.categoryName === undefined ? {} : { categoryName: row.categoryName }),
      name: row.name,
      description: row.description,
      pricePence: row.pricePence,
      ...(row.promotion === undefined ? {} : { promotion: row.promotion }),
      options,
      replacementPricePence: replacementAllowed ? row.replacementPricePence : null,
      ...(replacementAllowed && row.replacementLabel !== undefined
        ? { replacementLabel: row.replacementLabel }
        : {}),
    });
  }
  return { available: true, checkedAt: new Date(data.checkedAt).toISOString(), items };
}

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
    if (
      row.promotion !== undefined &&
      !isPublicMilkcakePromotion(row.promotion, row.sku, row.pricePence, data.checkedAt)
    )
      throw new Error("mealdeck_public_menu_invalid_response");
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
        ...(option.label === undefined ? {} : { label: option.label }),
      };
    }
    const replacement = binding.replacement ? replacements.get(binding.replacement.id) : null;
    items.push({
      sku: binding.sku,
      ...(row.categoryName === undefined ? {} : { categoryName: row.categoryName }),
      name: row.name,
      description: row.description,
      pricePence: row.pricePence,
      ...(row.promotion === undefined ? {} : { promotion: row.promotion }),
      options,
      replacementPricePence:
        replacement?.available && replacement.groupId === binding.replacement?.groupId
          ? replacement.pricePence
          : null,
      ...(replacement?.label !== undefined && replacement.groupId === binding.replacement?.groupId
        ? { replacementLabel: replacement.label }
        : {}),
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
  const selected = readMealDeckBackendConfig(env);
  if (selected.status !== "ready")
    return Response.json(
      { available: false, reason: "menu_unconfigured" },
      { status: 503, headers },
    );
  try {
    const client = createClient(selected.backend.url, selected.backend.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetcher },
    });
    const { data, error } = await client
      .rpc("mealdeck_public_menu", {})
      .abortSignal(AbortSignal.timeout(8000));
    if (error) throw new Error("mealdeck_public_menu_unavailable");
    return Response.json(sanitizePublicMenuSnapshot(data), { headers });
  } catch {
    // Never return provider errors, credentials, table names or private scope.
    return Response.json(
      { available: false, reason: "menu_unavailable" },
      { status: 503, headers },
    );
  }
}
