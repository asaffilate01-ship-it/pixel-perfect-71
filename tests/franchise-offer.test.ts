import { describe, expect, test } from "bun:test";
import { DEFAULT_PROGRAMME, OFFER_VERSION, PLANNED_TERRITORIES, TAKEN_MARKETS, money, normaliseTerritories } from "../src/lib/franchise-offer";

const available = (overrides: Record<string, unknown> = {}) => ({
  code: "MD-TEST", name: "Example town", region: "London",
  status: "available", isSellable: true, fee: 10000, currency: "GBP", ...overrides,
});

describe("public franchise offer", () => {
  test("separates revised fees from an unagreed royalty and the opening estimate", () => {
    expect(OFFER_VERSION).toBe("2026-10-06-r2");
    expect(DEFAULT_PROGRAMME).toMatchObject({
      offerVersion: OFFER_VERSION, franchiseFeeVersion: OFFER_VERSION,
      feeMin: 3750, feeMax: 12500, royaltyPercent: null, marketingPercent: 1.5,
      royaltyStatus: "quote_required", royaltyDisplay: "To be confirmed in written quote",
      techFeePerMonth: 199, accountancyFeePerMonth: 100,
      boughtInSupplyMarkupPercent: 0, manufacturedSupplyMarkupPercent: 15,
      manufacturedSupplyCostBasis: "fully_costed_production",
      equipmentOpeningSuppliesEstimate: 15000,
    });
    expect("techFeePerOrder" in DEFAULT_PROGRAMME).toBe(false);
    expect("supplyMarkupPercent" in DEFAULT_PROGRAMME).toBe(false);
  });

  test("formats custom fee pennies without adding decimals to whole-pound tiers", () => {
    expect(money(3750)).toBe("£3,750");
    expect(money(12500)).toBe("£12,500");
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
      const [territory] = normaliseTerritories([available({ name: market.name, note: market.note })]);
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
    })]);
    expect(territory).toEqual({
      code: "MD-TEST", name: "Example town", region: "London", status: "available",
      isSellable: true, fee: 10000, currency: "GBP",
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

  test("invalid fees cannot enter a published calculation", () => {
    for (const fee of [NaN, Infinity, -1, 0, 3749, 12501, 30000, "10000"]) {
      expect(normaliseTerritories([available({ fee })])[0].fee).toBeNull();
    }
  });

  test("browser normalisation never discounts a fee and is idempotent", () => {
    const once = normaliseTerritories([
      available({ franchiseFeeVersion: OFFER_VERSION }),
      available({ code: "MD-LOW", fee: 3750, franchiseFeeVersion: OFFER_VERSION }),
      available({ code: "MD-HIGH", fee: 12500 }),
    ]);
    expect(once.map((item) => item.fee)).toEqual([10000, 3750, 12500]);
    expect(normaliseTerritories(once)).toEqual(once);
    expect(normaliseTerritories(normaliseTerritories(once))).toEqual(once);
  });

  test("historical or unknown price markers cannot be treated as canonical prices", () => {
    for (const franchiseFeeVersion of ["legacy", "future", null]) {
      expect(normaliseTerritories([available({ franchiseFeeVersion })])[0].fee).toBeNull();
    }
  });

  test("conflicting duplicate prices require a quote in either order and stay unresolved", () => {
    const rows = [
      available({ franchiseFeeVersion: OFFER_VERSION }),
      available({ fee: 5000, franchiseFeeVersion: OFFER_VERSION }),
      available({ franchiseFeeVersion: OFFER_VERSION }),
    ];
    for (const input of [rows, rows.toReversed()]) {
      const canonical = normaliseTerritories(input);
      expect(canonical[0].fee).toBeNull();
      expect(normaliseTerritories(canonical)).toEqual(canonical);
    }
  });
});
