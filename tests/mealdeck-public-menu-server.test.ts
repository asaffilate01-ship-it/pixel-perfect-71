import { describe, expect, test } from "bun:test";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import { checkoutModifierId } from "../src/lib/mealdeck-checkout-selection";
import {
  hydrateMealDeckPublicMenu,
  parseMealDeckPublicMenu,
} from "../src/lib/mealdeck-public-menu";
import {
  handlePublicMenuRequest,
  projectPublicMenuSnapshot,
  sanitizePublicMenuSnapshot,
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
function option(
  groupId: string,
  optionId: string,
  pricePence = 75,
  available = true,
  label?: string,
) {
  return {
    id: checkoutModifierId(tenantId, "option", optionId),
    groupId: checkoutModifierId(tenantId, "group", groupId),
    pricePence,
    available,
    ...(label === undefined ? {} : { label }),
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
  test("new canonical category and modifier labels reach the customer without leaking database IDs", () => {
    const group = skorch.optionGroups.find(
      (entry) => ace.optionGroupIds.includes(entry.id) && !entry.required && !entry.when,
    )!;
    const sourceOption = group.options.find((entry) => entry.available !== false)!;
    const savedOption = option(group.id, sourceOption.id, 137, false);
    const data = {
      ...snapshot(),
      items: [
        {
          ...snapshot().items[0]!,
          categoryName: "  Renamed smash burger menu  ",
          options: [
            { ...savedOption, label: "  Extra smoked cheese  " },
            {
              id: otherId,
              groupId: otherId,
              label: "PRIVATE UNPUBLISHED CHOICE",
              pricePence: 99,
              available: true,
            },
          ],
        },
      ],
    };
    const result = projectPublicMenuSnapshot(data, scope);
    expect(parseMealDeckPublicMenu(result)).not.toBeNull();
    expect(result.items[0]!.categoryName).toBe("Renamed smash burger menu");
    expect(result.items[0]!.options[sourceOption.id]).toEqual({
      label: "Extra smoked cheese",
      pricePence: 137,
      available: false,
    });
    const current = hydrateMealDeckPublicMenu(result).find((brand) => brand.id === skorch.id)!;
    expect(
      current.sections.find((section) => section.items.some((item) => item.id === ace.id))!.title,
    ).toBe("Renamed smash burger menu");
    expect(
      current.optionGroups
        .find((entry) => entry.id === group.id)!
        .options.find((entry) => entry.id === sourceOption.id)!.label,
    ).toBe("Extra smoked cheese");
    for (const hidden of [
      tenantId,
      locationId,
      savedOption.id,
      savedOption.groupId,
      otherId,
      "PRIVATE UNPUBLISHED CHOICE",
    ])
      expect(JSON.stringify(result)).not.toContain(hidden);
  });

  test("legacy RPC rows omit additive label fields and malformed present labels fail closed", () => {
    const legacy = projectPublicMenuSnapshot(snapshot(), scope);
    expect(legacy.items[0]).not.toHaveProperty("categoryName");
    expect(
      hydrateMealDeckPublicMenu(legacy).find((brand) => brand.id === skorch.id)!.sections[0]!.title,
    ).toBe(skorch.sections[0]!.title);
    for (const label of [null, 8, "", " ", "x".repeat(141)]) {
      const category = { ...snapshot(), items: [{ ...snapshot().items[0]!, categoryName: label }] };
      expect(() => projectPublicMenuSnapshot(category, scope)).toThrow();
      const modifier = {
        ...snapshot(),
        items: [{ ...snapshot().items[0]!, options: [{ ...option("test", "test"), label }] }],
      };
      expect(() => projectPublicMenuSnapshot(modifier, scope)).toThrow();
    }
  });

  test("GET uses only the selected public backend without checkout scope or service credentials", async () => {
    const calls: Record<string, unknown>[] = [];
    const data = {
      ...projectPublicMenuSnapshot(snapshot(), scope),
      tenantId,
      locationId,
      internalSecret: "PRIVATE",
      customerEmail: "private@example.invalid",
    };
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://menufixture.supabase.co/rest/v1/rpc/mealdeck_public_menu",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe(env.MEALDECK_SUPABASE_PUBLISHABLE_KEY);
      expect(headers.get("Authorization")).toBe("Bearer " + env.MEALDECK_SUPABASE_PUBLISHABLE_KEY);
      expect(headers.has("Cookie")).toBe(false);
      calls.push(JSON.parse(String(init?.body)));
      return Response.json(data);
    }) as typeof fetch;
    const response = await handlePublicMenuRequest(
      new Request(
        `https://mealdeck.co.uk/api/public/menu?tenantId=${otherId}&locationId=${otherId}`,
        {
          headers: {
            Authorization: "Bearer private-customer-token",
            Cookie: "private-session=secret",
          },
        },
      ),
      {
        MEALDECK_SUPABASE_URL: env.MEALDECK_SUPABASE_URL,
        MEALDECK_SUPABASE_PUBLISHABLE_KEY: env.MEALDECK_SUPABASE_PUBLISHABLE_KEY,
      },
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
    expect(calls[0]).toEqual({});
    for (const privateValue of [
      tenantId,
      locationId,
      "PRIVATE",
      "private@example.invalid",
      env.MEALDECK_CHECKOUT_SERVER_KEY,
    ])
      expect(JSON.stringify(result)).not.toContain(privateValue);
  });

  test("public responses strip hidden fields, unknown source IDs and unsupported replacements", () => {
    const group = skorch.optionGroups.find(
      (entry) => ace.optionGroupIds.includes(entry.id) && !entry.required && !entry.when,
    )!;
    const known = group.options.find((entry) => entry.available !== false)!;
    const base = projectPublicMenuSnapshot(snapshot(), scope);
    const result = sanitizePublicMenuSnapshot({
      ...base,
      tenantId,
      orders: [{ email: "PRIVATE EMAIL" }],
      items: [
        {
          ...base.items[0]!,
          categoryName: "Current category",
          internalId: otherId,
          requiredGroupIds: [otherId],
          replacementPricePence: 7,
          replacementLabel: "PRIVATE UNREVIEWED REPLACEMENT",
          options: {
            [known.id]: {
              pricePence: 127,
              available: true,
              label: "Current option",
              id: otherId,
              costPence: 15,
            },
            [otherId]: { pricePence: 10, available: true, label: "PRIVATE UNKNOWN OPTION" },
          },
        },
        { ...base.items[0]!, sku: "unreviewed-private-special", name: "PRIVATE DRAFT" },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.options).toEqual({
      [known.id]: { pricePence: 127, available: true, label: "Current option" },
    });
    expect(result.items[0]!.categoryName).toBe("Current category");
    expect(result.items[0]!.replacementPricePence).toBeNull();
    expect(result.items[0]).not.toHaveProperty("replacementLabel");
    for (const value of [
      tenantId,
      otherId,
      "PRIVATE",
      "internalId",
      "requiredGroupIds",
      "costPence",
      "orders",
    ])
      expect(JSON.stringify(result)).not.toContain(value);
    expect(parseMealDeckPublicMenu(result)).not.toBeNull();
  });

  test("public projection preserves canonical variant deltas and does not enable unreviewed milkshakes", () => {
    const milkshakeGroup = skorch.optionGroups.find((group) =>
      group.options.some((choice) => /milkshake/i.test(choice.label)),
    )!;
    const milkshake = milkshakeGroup.options.find((choice) => /milkshake/i.test(choice.label))!;
    const tavo = launchMenuBrands.find((brand) => brand.id === "tavo-chicken")!;
    const source = tavo.sections
      .flatMap((section) => section.items)
      .find((item) => item.priceVariants?.length)!;
    const variant = source.priceVariants![0]!;
    const base = projectPublicMenuSnapshot(snapshot(), scope);
    const result = sanitizePublicMenuSnapshot({
      ...base,
      items: [
        { ...base.items[0]!, options: { [milkshake.id]: { pricePence: 299, available: true } } },
        {
          ...base.items[0]!,
          sku: source.id,
          options: {
            [variant.optionId]: { pricePence: 137, available: false, label: "Current variant" },
          },
        },
      ],
    });
    expect(result.items[0]!.options[milkshake.id]!.available).toBe(false);
    expect(result.items[1]!.options[variant.optionId]).toEqual({
      pricePence: 137,
      available: false,
      label: "Current variant",
    });
  });

  test("a generic backend, mismatched project, conflicting alias or secret in the public slot is rejected before RPC", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch;
    const wrongProjectKey = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({ iss: "supabase", role: "anon", ref: "differentproject" }),
      ).toString("base64url"),
      "signature",
    ].join(".");
    for (const invalid of [
      {
        SUPABASE_URL: env.MEALDECK_SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: env.MEALDECK_SUPABASE_PUBLISHABLE_KEY,
      },
      { ...env, MEALDECK_SUPABASE_PUBLISHABLE_KEY: wrongProjectKey },
      { ...env, DISHBEE_SUPABASE_URL: "https://otherproject.supabase.co" },
      { ...env, MEALDECK_SUPABASE_PUBLISHABLE_KEY: env.MEALDECK_CHECKOUT_SERVER_KEY },
    ]) {
      const response = await handlePublicMenuRequest(
        new Request("https://mealdeck.co.uk/api/public/menu"),
        invalid,
        fetcher,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ available: false, reason: "menu_unconfigured" });
    }
    expect(calls).toBe(0);
  });

  test("malformed public snapshots fail closed without retrying a privileged catalogue", async () => {
    const base = projectPublicMenuSnapshot(snapshot(), scope);
    for (const bad of [
      snapshot(),
      { ...base, items: [base.items[0], base.items[0]] },
      { ...base, items: [{ ...base.items[0], pricePence: 12.5 }] },
      {
        ...base,
        items: [{ ...base.items[0], options: { unknown: { pricePence: 0, available: "true" } } }],
      },
      { ...base, checkedAt: "invalid" },
    ]) {
      let calls = 0;
      const fetcher = (async (input: RequestInfo | URL) => {
        expect(String(input)).toEndWith("/rpc/mealdeck_public_menu");
        calls++;
        return Response.json(bad);
      }) as typeof fetch;
      const response = await handlePublicMenuRequest(
        new Request("https://mealdeck.co.uk/api/public/menu"),
        env,
        fetcher,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ available: false, reason: "menu_unavailable" });
      expect(calls).toBe(1);
    }
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
      option(
        "cross-drink-replacement",
        `cross-drink-replacement-${target.id}`,
        325,
        true,
        "Summer citrus swap",
      ),
    ];
    expect(projectPublicMenuSnapshot(data, scope).items[0]!.replacementPricePence).toBe(325);
    expect(projectPublicMenuSnapshot(data, scope).items[0]!.replacementLabel).toBe(
      "Summer citrus swap",
    );
    expect(projectPublicMenuSnapshot(data, scope).items[0]!.pricePence).toBe(575);
    data.replacementOptions[0]!.available = false;
    expect(projectPublicMenuSnapshot(data, scope).items[0]!.replacementPricePence).toBeNull();
    data.replacementOptions[0]!.groupId = otherId;
    expect(projectPublicMenuSnapshot(data, scope).items[0]).not.toHaveProperty("replacementLabel");
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
