import test from "node:test";
import assert from "node:assert/strict";
import { featuredOffers, promoOffers, quoteDeckPreview } from "../src/lib/promotions.ts";

test("partial or mismatched selections cannot earn a preview discount", () => {
  assert.equal(quoteDeckPreview({ main: "preview-grill" }).eligible, false);
  const forged = quoteDeckPreview({
    main: "preview-mocktail",
    side: "preview-sharing",
    drink: "preview-mocktail",
  });
  assert.equal(forged.complete, false);
  assert.equal(forged.savingPence, 0);
});

test("a full bundle under £20 receives no discount", () => {
  const quote = quoteDeckPreview({
    main: "preview-paratha",
    side: "preview-fries",
    drink: "preview-latte",
  });
  assert.equal(quote.complete, true);
  assert.equal(quote.subtotalPence, 1950);
  assert.equal(quote.eligible, false);
  assert.equal(quote.shortfallPence, 50);
  assert.equal(quote.savingPence, 0);
});

test("20% applies only when a complete bundle meets the minimum", () => {
  const quote = quoteDeckPreview({
    main: "preview-taco",
    side: "preview-fries",
    drink: "preview-latte",
  });
  assert.equal(quote.subtotalPence, 2050);
  assert.equal(quote.savingPence, 410);
  assert.equal(quote.totalPence, 1640);
});

test("larger bundles cannot exceed the £5 saving cap", () => {
  const quote = quoteDeckPreview({
    main: "preview-grill",
    side: "preview-sharing",
    drink: "preview-mocktail",
  });
  assert.equal(quote.subtotalPence, 2650);
  assert.equal(quote.savingPence, 500);
  assert.equal(quote.totalPence, 2150);
});

test("the campaign catalogue has unique IDs and exactly three featured offers", () => {
  assert.equal(promoOffers.length, 15);
  assert.equal(new Set(promoOffers.map((offer) => offer.id)).size, 15);
  assert.deepEqual(
    featuredOffers.map((offer) => offer.id),
    ["house-offer", "build-your-deck", "snap"],
  );
});
