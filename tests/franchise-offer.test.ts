import { describe, expect, test } from "bun:test";
import { DEFAULT_PROGRAMME, FRANCHISE_FEE_VERSION, OFFER_VERSION, PLANNED_TERRITORIES, TAKEN_MARKETS, money, normaliseTerritories } from "../src/lib/franchise-offer";

const available = (overrides: Record<string, unknown> = {}) => ({
  code: "MD-TEST", name: "Example town", region: "London",
  status: "available", isSellable: true, fee: 10000, currency: "GBP", ...overrides,
});

describe("public franchise offer", () => {
  test("publishes only the complete launch range and quote-required ongoing services", () => {
    expect(OFFER_VERSION).toBe("2026-10-08-poa");
    expect(FRANCHISE_FEE_VERSION).toBe("2026-10-06-r2");
    expect(OFFER_VERSION).not.toBe(FRANCHISE_FEE_VERSION);
    expect(DEFAULT_PROGRAMME).toEqual({
      key: "mealdeck-england-wales", name: "MealDeck England & Wales", currency: "GBP",
      offerVersion: OFFER_VERSION, franchiseFeeVersion: FRANCHISE_FEE_VERSION,
      upfrontFeeMin: 18750, upfrontFeeMax: 27500,
      upfrontPaymentTiming: "upfront", upfrontFeeVatBasis: "exclusive_where_applicable",
      ongoingFeesStatus: "quote_required", ongoingFeesDisplay: "POA",
      techIncludesHaccora: true,
    });
    expect(Object.values(DEFAULT_PROGRAMME).filter((value) => typeof value === "number")).toEqual([18750, 27500]);
  });

  test("formats the overall launch range without unnecessary decimals", () => {
    expect(money(DEFAULT_PROGRAMME.upfrontFeeMin)).toBe("£18,750");
    expect(money(DEFAULT_PROGRAMME.upfrontFeeMax)).toBe("£27,500");
    expect(money(6172.84)).toBe("£6,172.84");
  });

  test("planned search areas never claim confirmed availability or a priced territory", () => {
    expect(PLANNED_TERRITORIES.length).toBeGreaterThan(0);
    for (const territory of PLANNED_TERRITORIES) {
      expect(territory.status).toBe("planned");
      expect(territory.isSellable).toBe(false);
      expect(territory.fee).toBeNull();
    }
    expect(new Set(PLANNED_TERRITORIES.map((territory) => territory.code)).size).toBe(PLANNED_TERRITORIES.length);
  });
});

describe("public territory boundary", () => {
  test("empty or malformed upstream data does not invent availability", () => {
    expect(normaliseTerritories(undefined)).toEqual([]);
    expect(normaliseTerritories({ territories: [] })).toEqual([]);
    expect(normaliseTerritories([])).toEqual([]);
    expect(normaliseTerritories([null, 1, {}, available({ code: "../private" }), available({ code: "A".repeat(41) }), available({ currency: "USD" })])).toEqual([]);
  });

  test("known taken anchors stay taken even when upstream says available", () => {
    for (const market of TAKEN_MARKETS) {
      const [territory] = normaliseTerritories([available({ name: market.name })]);
      expect(territory.status).toBe("taken");
      expect(territory.isSellable).toBe(false);
    }
    for (const postcode of ["LU4 8NU", "AL13JU", "N7 8XH"]) {
      expect(normaliseTerritories([available({ name: "Renamed market", anchorPostcode: postcode })])[0].status).toBe("taken");
    }
    expect(normaliseTerritories([available({ name: "Islington" })])[0].status).toBe("taken");
    expect(normaliseTerritories([available({ name: "Luton / Dunstable" })])[0].status).toBe("taken");
    expect(normaliseTerritories([available({ name: "Camden north" })])[0].isSellable).toBe(true);
  });

  test("availability needs explicit sellability and private metadata is stripped", () => {
    const [territory] = normaliseTerritories([available({
      note: "Private negotiation note", score: 94, ownerId: "private-owner",
      investorName: "Private name", internalNotes: "Private financial terms",
      royaltyPercent: 8, techPercent: 5, marketingPercent: 5,
      accountancyFeePerMonth: 100, adminFeePerMonth: 100,
      equipmentOpeningSuppliesFee: 15000,
      pricing: { aggregatorPercent: 5, manufacturedSupplyMarkupPercent: 10 },
    })]);
    expect(territory).toEqual({
      code: "MD-TEST", name: "Example town", region: "London", status: "available",
      isSellable: true, fee: null, currency: "GBP",
    });
    expect(normaliseTerritories([available({ isSellable: "true" })])[0].isSellable).toBe(false);
    expect(normaliseTerritories([available({ status: "draft" })])[0].status).toBe("planned");
    expect(normaliseTerritories([available({ status: "reserved" })])[0].isSellable).toBe(false);
  });

  test("conflicting duplicate codes cannot make a territory selectable", () => {
    const rows = [available(), available({ status: "taken" })];
    expect(normaliseTerritories(rows)[0].isSellable).toBe(false);
    expect(normaliseTerritories(rows.toReversed())[0].isSellable).toBe(false);
    expect(normaliseTerritories([available(), available({ name: "Other town" })])[0].status).toBe("unavailable");
  });

  test("no territory fee can escape, including valid and malformed private quotes", () => {
    for (const fee of [3750, 5000, 10000, 12500, NaN, Infinity, -1, 0, 3749, 12501, 30000, "10000"]) {
      expect(normaliseTerritories([available({ fee })])[0].fee).toBeNull();
    }
  });

  test("browser normalisation keeps quotes private and is idempotent", () => {
    const once = normaliseTerritories([
      available({ franchiseFeeVersion: FRANCHISE_FEE_VERSION }),
      available({ code: "MD-LOW", fee: 3750, franchiseFeeVersion: FRANCHISE_FEE_VERSION }),
      available({ code: "MD-HIGH", fee: 12500 }),
    ]);
    expect(once.map((item) => item.fee)).toEqual([null, null, null]);
    expect(normaliseTerritories(once)).toEqual(once);
    expect(normaliseTerritories(normaliseTerritories(once))).toEqual(once);
  });

  test("price revision markers cannot opt a private quote into public data", () => {
    for (const franchiseFeeVersion of [FRANCHISE_FEE_VERSION, "legacy", "future", null, undefined]) {
      expect(normaliseTerritories([available({ franchiseFeeVersion })])[0].fee).toBeNull();
    }
  });

  test("duplicate private quotes do not publish a price or change otherwise valid availability", () => {
    const rows = [
      available({ franchiseFeeVersion: FRANCHISE_FEE_VERSION }),
      available({ fee: 5000, franchiseFeeVersion: FRANCHISE_FEE_VERSION }),
      available({ franchiseFeeVersion: FRANCHISE_FEE_VERSION }),
    ];
    for (const input of [rows, rows.toReversed()]) {
      const canonical = normaliseTerritories(input);
      expect(canonical[0].fee).toBeNull();
      expect(canonical[0].isSellable).toBe(true);
      expect(normaliseTerritories(canonical)).toEqual(canonical);
    }
  });
});

