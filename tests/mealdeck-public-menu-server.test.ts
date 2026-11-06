import { describe, expect, test } from "bun:test";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import { checkoutModifierId } from "../src/lib/mealdeck-checkout-selection";
import {
  handlePublicMenuRequest,
  projectPublicMenuSnapshot,
  publicMenuBindings,
} from "../src/lib/mealdeck-public-menu.server";

const tenantId = "40000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000002";
const otherId = "40000000-0000-4000-8000-000000000003";
const env = {
  MEALDECK_SUPABASE_URL: "https://menufixture.supabase.co",
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_menu_fixture_public",
  MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_menu_fixture_server",
  MEALDECK_TENANT_ID: tenantId,
  MEALDECK_LUTON_LOCATION_ID: locationId,
  MEALDECK_ONLINE_CHECKOUT_ENABLED: "false",
};
const skorch = launchMenuBrands.find((brand) => brand.id === "skorch-burgers")!;
const ace = skorch.sections
  .flatMap((section) => section.items)
  .find((item) => item.name === "The Ace")!;
const scope = { tenantId, locationId };
function option(groupId: string, optionId: string, pricePence = 75, available = true) {
  return {
    id: checkoutModifierId(tenantId, "option", optionId),
    groupId: checkoutModifierId(tenantId, "group", groupId),
    pricePence,
    available,
  };
}
function snapshot() {
  return {
    schemaVersion: 1,
    tenantId,
    locationId,
    checkedAt: "2026-11-06T15:00:00Z",
    items: [
      {
        sku: ace.id,
        brandSlug: skorch.id,
        name: "Chef's revised Ace",
        description: "Current description",
        pricePence: 425,
        requiredGroupIds: [] as string[],
        options: [] as ReturnType<typeof option>[],
      },
    ],
    replacementOptions: [] as ReturnType<typeof option>[],
  };
}

describe("public canonical menu adapter", () => {
  test("GET reads only the trusted Luton scope while ordering is disabled and strips private fields", async () => {
    const calls: Record<string, unknown>[] = [];
    const data = {
      ...snapshot(),
      internalSecret: "PRIVATE",
      customerEmail: "private@example.invalid",
    };
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://menufixture.supabase.co/rest/v1/rpc/mealdeck_public_launch_catalogue",
      );
      expect(new Headers(init?.headers).get("apikey")).toBe(env.MEALDECK_CHECKOUT_SERVER_KEY);
      calls.push(JSON.parse(String(init?.body)));
      return Response.json(data);
    }) as typeof fetch;
    const response = await handlePublicMenuRequest(
      new Request(`https://mealdeck.co.uk/api/public/menu?tenantId=${otherId}`),
      env,
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = await response.json();
    expect(result.items[0]).toEqual({
      sku: ace.id,
      name: "Chef's revised Ace",
      description: "Current description",
      pricePence: 425,
      options: {},
      replacementPricePence: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      p_tenant: tenantId,
      p_location: locationId,
      p_skus: publicMenuBindings(tenantId).skus,
      p_replacement_options: publicMenuBindings(tenantId).replacementOptionIds,
    });
    for (const privateValue of [
      tenantId,
      locationId,
      "PRIVATE",
      "private@example.invalid",
      env.MEALDECK_CHECKOUT_SERVER_KEY,
    ])
      expect(JSON.stringify(result)).not.toContain(privateValue);
  });

  test("Tavo variants retain canonical deltas and inactive choices stay unavailable", () => {
    const tavo = launchMenuBrands.find((brand) => brand.id === "tavo-chicken")!;
    const chicken = tavo.sections
      .flatMap((section) => section.items)
      .find((item) => item.priceVariants?.length)!;
    const variant = chicken.priceVariants![1]!;
    const data = snapshot();
    data.items = [
      {
        sku: chicken.id,
        brandSlug: tavo.id,
        name: chicken.name,
        description: "Portion and flavour",
        pricePence: 319,
        requiredGroupIds: [checkoutModifierId(tenantId, "group", variant.groupId)],
        options: [option(variant.groupId, variant.optionId, 275, false)],
      },
    ];
    const result = projectPublicMenuSnapshot(data, scope);
    expect(result.items[0]!.pricePence).toBe(319);
    expect(result.items[0]!.options[variant.optionId]).toEqual({
      pricePence: 275,
      available: false,
    });
    expect(Object.keys(result.items[0]!.options)).toHaveLength(1);
  });

  test("cross replacement uses its canonical option price, not the standalone target price", () => {
    const target = launchMenuBrands
      .find((brand) => brand.id === "moktl")!
      .sections.find((section) => section.id === "mocktail-lounge")!.items[0]!;
    const data = snapshot();
    data.items = [
      {
        sku: target.id,
        brandSlug: "moktl",
        name: target.name,
        description: "Mocktail",
        pricePence: 575,
        requiredGroupIds: [],
        options: [],
      },
    ];
    data.replacementOptions = [
      option("cross-drink-replacement", `cross-drink-replacement-${target.id}`, 325),
    ];
    expect(projectPublicMenuSnapshot(data, scope).items[0]!.replacementPricePence).toBe(325);
    expect(projectPublicMenuSnapshot(data, scope).items[0]!.pricePence).toBe(575);
    data.replacementOptions[0]!.available = false;
    expect(projectPublicMenuSnapshot(data, scope).items[0]!.replacementPricePence).toBeNull();
  });

  test("unknown items/options and unsupported required groups cannot become public dishes", () => {
    const data = snapshot();
    data.items.push({
      ...data.items[0]!,
      sku: "private-unpublished-special",
      name: "PRIVATE DRAFT",
    });
    data.items[0]!.options = [{ id: otherId, groupId: otherId, pricePence: 999, available: true }];
    const result = projectPublicMenuSnapshot(data, scope);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.options).toEqual({});
    expect(JSON.stringify(result)).not.toContain("PRIVATE DRAFT");
    data.items[0]!.requiredGroupIds = [otherId];
    expect(projectPublicMenuSnapshot(data, scope).items).toEqual([]);
  });

  test("an unapproved milkshake flavour is not enabled by an active database option", () => {
    const group = skorch.optionGroups.find((candidate) =>
      candidate.options.some((option) => /milkshake/i.test(option.label)),
    )!;
    const milkshake = group.options.find((option) => /milkshake/i.test(option.label))!;
    const data = snapshot();
    data.items[0]!.options = [option(group.id, milkshake.id, 299, true)];
    expect(projectPublicMenuSnapshot(data, scope).items[0]!.options[milkshake.id]).toEqual({
      pricePence: 299,
      available: false,
    });
  });

  test("wrong scope, duplicates and malformed amounts fail closed", () => {
    const wrongScope = { ...snapshot(), tenantId: otherId };
    const duplicate = snapshot();
    duplicate.items.push(duplicate.items[0]!);
    const wrongPrice = snapshot();
    wrongPrice.items[0]!.pricePence = 12.5;
    for (const data of [wrongScope, duplicate, wrongPrice])
      expect(() => projectPublicMenuSnapshot(data, scope)).toThrow();
  });

  test("missing configuration and unsupported methods never call the backend", async () => {
    const fetcher = (() => {
      throw new Error("Unexpected network call");
    }) as typeof fetch;
    const missing = await handlePublicMenuRequest(
      new Request("https://mealdeck.co.uk/api/public/menu"),
      {},
      fetcher,
    );
    expect(missing.status).toBe(503);
    const method = await handlePublicMenuRequest(
      new Request("https://mealdeck.co.uk/api/public/menu", { method: "POST" }),
      env,
      fetcher,
    );
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET");
  });

  test("provider errors are reduced to a non-cached public reason", async () => {
    const fetcher = (async () =>
      Response.json(
        { message: `PRIVATE ${env.MEALDECK_CHECKOUT_SERVER_KEY}` },
        { status: 403 },
      )) as typeof fetch;
    const response = await handlePublicMenuRequest(
      new Request("https://mealdeck.co.uk/api/public/menu"),
      env,
      fetcher,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ available: false, reason: "menu_unavailable" });
  });
});
