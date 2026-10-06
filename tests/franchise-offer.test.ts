import { describe, expect, test } from "bun:test";
import { DEFAULT_PROGRAMME, OFFER_VERSION, PLANNED_TERRITORIES, TAKEN_MARKETS, money, normaliseTerritories, techFee } from "../src/lib/franchise-offer";

const available = (overrides: Record<string, unknown> = {}) => ({
  code: "MD-TEST", name: "Example town", region: "London",
  status: "available", isSellable: true, fee: 15000, currency: "GBP", ...overrides,
});

describe("public franchise offer", () => {
  test("preserves the agreed ongoing pricing and base fee separately from setup", () => {
    expect(OFFER_VERSION).toBe("2026-10-06");
    expect(DEFAULT_PROGRAMME).toMatchObject({
      feeMin: 7500, feeMax: 25000, royaltyPercent: 5.5, marketingPercent: 1.5,
      techFeePerOrder: 0.25, supplyMarkupPercent: 10,
    });
    expect(money(7500)).toBe("£7,500");
    expect(techFee(0.25)).toBe("25p");
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
      isSellable: true, fee: 15000, currency: "GBP",
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
    for (const fee of [NaN, Infinity, -1, 0, 7000, 30000, "25000"]) {
      expect(normaliseTerritories([available({ fee })])[0].fee).toBeNull();
    }
  });
});
