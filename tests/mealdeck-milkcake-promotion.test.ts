import { describe, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import {
  hydrateMealDeckPublicMenu,
  parseMealDeckPublicMenu,
  type MealDeckPublicMenuSnapshot,
} from "../src/lib/mealdeck-public-menu";
import { sanitizePublicMenuSnapshot } from "../src/lib/mealdeck-public-menu.server";
import {
  MILKCAKE_PROMOTION_SKUS,
  MILKCAKE_PROMOTION_STARTS_AT,
  MILKCAKE_PROMOTION_ENDS_AT,
  isMealDeckMilkcakePromotion,
  appliedMilkcakePromotion,
  milkcakeQuoteDisplayTotals,
  type MealDeckMilkcakePromotion,
  type AppliedMealDeckMilkcakePromotion,
} from "../src/lib/mealdeck-milkcake-promotion";
import {
  formatLaunchMenuItemPrice,
  launchMenuOfferBasketDisplayPrice,
} from "../src/lib/launch-menu-display-prices";
import { findLaunchMenuItem, type LaunchMenuPick } from "../src/lib/launch-menu-picks";
import { openingOfferDiscountPence } from "../src/lib/mealdeck-opening-offer";
import { LaunchBasket } from "../src/components/menus/launch-basket";
import { LaunchMenuBrowser } from "../src/components/menus/launch-menu-browser";
import { LaunchItemCustomiser } from "../src/components/menus/launch-item-customiser";
import { Dialog } from "../src/components/ui/dialog";
import { PwaProvider } from "../src/components/pwa-provider";
import { CheckoutPriceSummary, DetailedOrderLines } from "../src/components/launch-checkout";

const promotion: MealDeckMilkcakePromotion = {
  id: "sunday-milk-cake-20261108",
  finalUnitPence: 99,
  regularUnitPence: 399,
  maximumQuantityPerOrder: 1,
  discountIncluded: true,
  startsAt: MILKCAKE_PROMOTION_STARTS_AT,
  endsAt: MILKCAKE_PROMOTION_ENDS_AT,
};
const appliedPromotion: AppliedMealDeckMilkcakePromotion = {
  ...promotion,
  eligibleQuantity: 1,
  discountPence: 300,
};

function snapshot(checkedAt = "2026-11-08T15:00:00Z"): MealDeckPublicMenuSnapshot {
  return {
    available: true,
    checkedAt,
    items: launchMenuBrands.flatMap((brand) =>
      brand.sections.flatMap((section) =>
        section.items.map((item) => ({
          sku: item.id,
          name: item.name,
          description: item.description ?? null,
          pricePence: item.pricePence!,
          options: {},
          replacementPricePence: null,
          ...(MILKCAKE_PROMOTION_SKUS.some((id) => id === item.id) ? { promotion } : {}),
        })),
      ),
    ),
  };
}

function pick(sku: string = MILKCAKE_PROMOTION_SKUS[0], quantity = 1): LaunchMenuPick {
  const brand = launchMenuBrands.find((entry) =>
    entry.sections.some((section) => section.items.some((item) => item.id === sku)),
  )!;
  return {
    key: sku,
    brandId: brand.id,
    itemId: sku,
    quantity,
    selections: {},
    crossSelections: [],
  };
}

function pricedCake(
  quantity = 1,
  marker: AppliedMealDeckMilkcakePromotion | undefined = appliedPromotion,
) {
  return {
    lineId: "cake-line",
    parentLineId: null,
    name: "Biscoff Milkcake",
    quantity,
    base_unit_pence: 399,
    unit_pence: 399,
    line_pence: 399 * quantity,
    modifiers: [],
    attachment: null,
    ...(marker ? { promotion: marker } : {}),
  };
}

function quote(quantity: number) {
  const grossPence = 399 * quantity;
  const discountPence = 300 + openingOfferDiscountPence(grossPence - 399);
  return {
    grossPence,
    discountPence,
    totalPence: grossPence - discountPence,
    lines: [pricedCake(quantity)],
  };
}

describe("One Sunday milkcake at 99p", () => {
  test("accepts all ten server-marked identities while preserving the regular £3.99 catalogue", () => {
    const original = JSON.stringify(launchMenuBrands);
    const live = sanitizePublicMenuSnapshot(snapshot());
    expect(parseMealDeckPublicMenu(live)).not.toBeNull();
    expect(live.items.filter((item) => item.promotion)).toHaveLength(10);
    const catalogue = hydrateMealDeckPublicMenu(live);
    for (const sku of MILKCAKE_PROMOTION_SKUS) {
      const selected = pick(sku);
      const item = findLaunchMenuItem(selected.brandId, sku, catalogue)!.item;
      expect(item.pricePence).toBe(399);
      expect(formatLaunchMenuItemPrice(item)).toBe("99p");
      expect(item.promotion).toEqual(promotion);
    }
    expect(JSON.stringify(launchMenuBrands)).toBe(original);
    expect(
      launchMenuBrands
        .flatMap((brand) => brand.sections.flatMap((section) => section.items))
        .every((item) => item.promotion === undefined),
    ).toBe(true);
  });

  test("validates the exact server window and rejects malformed, wrong-product or wrong-price markers", () => {
    expect(parseMealDeckPublicMenu(snapshot("2026-11-08T15:00:00Z"))).not.toBeNull();
    expect(parseMealDeckPublicMenu(snapshot("2026-11-08T22:59:59.999Z"))).not.toBeNull();
    for (const checkedAt of [
      "2026-11-08T14:59:59.999Z",
      "2026-11-08T23:00:00Z",
      "2026-11-09T15:00:00Z",
    ]) {
      expect(parseMealDeckPublicMenu(snapshot(checkedAt))).toBeNull();
      expect(() => sanitizePublicMenuSnapshot(snapshot(checkedAt))).toThrow();
    }
    const badPromotions = [
      null,
      {},
      { ...promotion, maximumQuantityPerOrder: 2 },
      { ...promotion, regularUnitPence: 129 },
      { ...promotion, finalUnitPence: 90 },
      { ...promotion, discountIncluded: false },
      { ...promotion, endsAt: "2026-11-09T00:00:00Z" },
    ];
    for (const bad of badPromotions) {
      const live = snapshot();
      Object.assign(
        live.items.find((item) => item.promotion)!,
        { promotion: bad },
      );
      expect(parseMealDeckPublicMenu(live)).toBeNull();
      expect(() => sanitizePublicMenuSnapshot(live)).toThrow();
    }
    for (const changes of [
      { pricePence: 99 },
      { pricePence: 129 },
      { sku: "milk-cake-like-name" },
    ]) {
      const live = snapshot();
      Object.assign(
        live.items.find((item) => item.promotion)!,
        changes,
      );
      expect(parseMealDeckPublicMenu(live)).toBeNull();
      expect(() => sanitizePublicMenuSnapshot(live)).toThrow();
    }
    const wrongProduct = snapshot();
    Object.assign(
      wrongProduct.items.find((item) => !item.promotion)!,
      { promotion, pricePence: 399 },
    );
    expect(parseMealDeckPublicMenu(wrongProduct)).toBeNull();
    expect(() => sanitizePublicMenuSnapshot(wrongProduct)).toThrow();
  });

  test("absent metadata remains compatible and cannot grant a source-only or stale offer", () => {
    const live = snapshot("2026-11-08T23:00:00Z");
    for (const item of live.items) delete item.promotion;
    expect(parseMealDeckPublicMenu(live)).not.toBeNull();
    const catalogue = hydrateMealDeckPublicMenu(sanitizePublicMenuSnapshot(live));
    const selected = pick();
    expect(
      formatLaunchMenuItemPrice(
        findLaunchMenuItem(selected.brandId, selected.itemId, catalogue)!.item,
      ),
    ).toBe("£3.99");
    expect(launchMenuOfferBasketDisplayPrice([selected], catalogue).itemsSubtotalPence).toBe(399);
    expect(launchMenuOfferBasketDisplayPrice([selected], launchMenuBrands).hasMilkcakeOffer).toBe(
      false,
    );
    expect(launchMenuOfferBasketDisplayPrice([selected], launchMenuBrands).itemsSubtotalPence).toBe(
      399,
    );
  });

  test("one allocation spans flavours and brands, and moves correctly when the first cake is removed", () => {
    const catalogue = hydrateMealDeckPublicMenu(snapshot());
    const picks = [pick(MILKCAKE_PROMOTION_SKUS[0], 2), pick(MILKCAKE_PROMOTION_SKUS[9], 1)];
    const basket = launchMenuOfferBasketDisplayPrice(picks, catalogue);
    expect(basket.lines.map((line) => line.promotionQuantity)).toEqual([1, 0]);
    expect(basket.lines.map((line) => line.displayedBaseLinePence)).toEqual([498, 399]);
    expect(basket.itemsSubtotalPence).toBe(897);
    expect(launchMenuOfferBasketDisplayPrice(picks.slice(1), catalogue).itemsSubtotalPence).toBe(
      99,
    );
    expect(launchMenuOfferBasketDisplayPrice([], catalogue).itemsSubtotalPence).toBe(0);
    for (const [quantity, expected] of [
      [1, 99],
      [2, 498],
      [3, 897],
    ] as const) {
      expect(
        launchMenuOfferBasketDisplayPrice([pick(undefined, quantity)], catalogue)
          .itemsSubtotalPence,
      ).toBe(expected);
    }
  });

  test("hidden cakes remain unavailable and browser-supplied prices never enter the estimate", () => {
    const live = snapshot();
    const selected = pick();
    live.items = live.items.filter((item) => item.sku !== selected.itemId);
    const catalogue = hydrateMealDeckPublicMenu(live);
    expect(launchMenuOfferBasketDisplayPrice([selected], catalogue).itemsSubtotalPence).toBeNull();
    const forged = {
      ...pick(),
      pricePence: 1,
      promotion: { ...promotion, maximumQuantityPerOrder: 10 },
    };
    const basket = launchMenuOfferBasketDisplayPrice(
      [forged, pick(MILKCAKE_PROMOTION_SKUS[1])],
      hydrateMealDeckPublicMenu(snapshot()),
    );
    expect(basket.itemsSubtotalPence).toBe(498);
    expect(basket.lines.map((line) => line.promotionQuantity)).toEqual([1, 0]);
  });

  test("presentation preserves canonical totals: one 99p, two £3.78, three £6.58", () => {
    for (const [quantity, final] of [
      [1, 99],
      [2, 378],
      [3, 658],
    ] as const) {
      const total = quote(quantity);
      const original = JSON.stringify(total);
      const display = milkcakeQuoteDisplayTotals(total);
      expect(display.totalPence).toBe(final);
      expect(display.itemsSubtotalPence).toBe(399 * quantity - 300);
      expect(display.itemsSubtotalPence - display.openingDiscountPence).toBe(final);
      expect(JSON.stringify(total)).toBe(original);
      const html = renderToStaticMarkup(createElement(CheckoutPriceSummary, { total }));
      expect(html).toContain("One 99p milkcake");
      expect(html).toContain("Discount included");
      if (quantity > 1) expect(html).toContain("30% off other items &amp; extras");
      else expect(html).not.toContain("30% off other items");
    }
  });

  test("allocates the one promotion to the lowest numbered bag, with later quantities at £3.99", () => {
    const props: ComponentProps<typeof DetailedOrderLines> = {
      lines: [pricedCake(3)],
      packingPlan: {
        version: 1,
        separateBags: true,
        cutleryRequested: false,
        bags: [
          { number: 2, allocations: [{ lineId: "cake-line", quantity: 1 }] },
          { number: 1, allocations: [{ lineId: "cake-line", quantity: 2 }] },
        ],
      },
    };
    const original = JSON.stringify(props);
    const html = renderToStaticMarkup(createElement(DetailedOrderLines, props));
    const bags = html.split('class="md-checkout-bag"').slice(1);
    expect(bags[0]).toContain('aria-label="Bag 2"');
    expect(bags[0]).toContain("£3.99");
    expect(bags[0]).not.toContain("offer included");
    expect(bags[1]).toContain('aria-label="Bag 1"');
    expect(bags[1]).toContain("£4.98");
    expect(bags[1]).toContain("1 milkcake · offer included");
    expect(bags[1]).toContain("99p");
    expect(bags[1]).toContain("1 additional milkcake · before 30% off");
    expect(html).not.toContain("£1.29");
    expect(JSON.stringify(props)).toBe(original);
  });

  test("historical or malformed allocations retain raw stored prices without invented offers", () => {
    const historicalLine = pricedCake();
    delete historicalLine.promotion;
    const old = { grossPence: 399, discountPence: 120, totalPence: 279, lines: [historicalLine] };
    expect(milkcakeQuoteDisplayTotals(old)).toEqual({
      itemsSubtotalPence: 399,
      openingDiscountPence: 120,
      totalPence: 279,
      promotion: null,
    });
    expect(renderToStaticMarkup(createElement(CheckoutPriceSummary, { total: old }))).not.toContain(
      "One 99p milkcake",
    );
    expect(
      appliedMilkcakePromotion([pricedCake(), { ...pricedCake(), lineId: "second" }]),
    ).toBeNull();
    expect(
      appliedMilkcakePromotion([
        { ...pricedCake(), promotion: { ...appliedPromotion, eligibleQuantity: 2 } },
      ]),
    ).toBeNull();
    expect(appliedMilkcakePromotion([{ ...pricedCake(), line_pence: 99 }])).toBeNull();
    expect(isMealDeckMilkcakePromotion(promotion)).toBe(true);
  });

  test("the rendered basket explains the cap beside quantities and exposes linked terms", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["mealdeck-public-menu", "luton"], snapshot());
    const props: ComponentProps<typeof LaunchBasket> = {
      picks: [pick(undefined, 2), pick(MILKCAKE_PROMOTION_SKUS[9])],
      onQuantity: () => {},
      onEdit: () => {},
      onRemove: () => {},
      onClear: () => {},
      onUndoClear: () => {},
      canUndoClear: false,
      storageStatus: "saved",
      onRetrySave: () => true,
    };
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(LaunchBasket, props)),
    );
    client.clear();
    expect(html).toContain("1 × 99p + 1 × £3.99 before 30% off");
    expect(html).toContain("Additional milkcake, before 30% off");
    expect(html).toContain("£8.97");
    expect(html).toContain('href="/offers#sunday-milk-cake"');
    expect(html).toContain("T&amp;Cs apply");
    expect(html).not.toContain("£1.29");
  });

  test("rendered menu cards show the 99p headline and terms without repricing the catalogue", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["mealdeck-public-menu", "luton"], snapshot());
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ["/menus"] }),
    });
    for (const brand of launchMenuBrands) {
      const html = renderToStaticMarkup(
        createElement(RouterContextProvider, {
          router,
          children: createElement(
            QueryClientProvider,
            { client },
            createElement(PwaProvider, {
              children: createElement(LaunchMenuBrowser, { requestedBrandId: brand.id }),
            }),
          ),
        }),
      );
      for (const flavour of ["biscoff", "oreo"]) {
        const price = html
          .split(`id="launch-price-${brand.id}-desserts-${flavour}-milkcake"`)[1]
          ?.split("</button>")[0];
        expect(price).toContain("99p");
        expect(price).toContain("T&amp;Cs apply");
        expect(price).not.toContain("£3.99");
      }
      expect(html).toContain("One milkcake per order is 99p after the 30% discount");
      expect(html).toContain("Additional milkcakes are £3.99 each before the usual 30% discount");
      expect(html).not.toContain("£1.29");
    }
    client.clear();
  });

  test("the item modal shows an additional cake at £3.99 when the order already uses its one 99p offer", () => {
    const live = snapshot();
    const catalogue = hydrateMealDeckPublicMenu(live);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["mealdeck-public-menu", "luton"], live);
    const second = pick(MILKCAKE_PROMOTION_SKUS[9]);
    const entry = findLaunchMenuItem(second.brandId, second.itemId, catalogue)!;
    const render = (basketPicks: LaunchMenuPick[]) =>
      renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            Dialog,
            { open: true },
            createElement(LaunchItemCustomiser, {
              draft: entry,
              basketPicks,
              onSave: () => {},
              onBack: () => {},
              error: "",
            }),
          ),
        ),
      );
    const first = render([]);
    const extra = render([pick()]);
    expect(first.split('class="lmc-item-price"')[1]?.split("</p>")[0]).toContain("99p");
    const extraPrice = extra.split('class="lmc-item-price"')[1]?.split("</p>")[0];
    expect(extraPrice).toContain("£3.99");
    expect(extraPrice).not.toContain("99p");
    expect(extra).toContain("One milkcake per order");
    expect(extra).toContain("T&amp;Cs apply");
    client.clear();
  });
});
