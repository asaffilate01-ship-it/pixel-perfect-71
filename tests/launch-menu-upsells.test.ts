import { describe, expect, test } from "bun:test";
import {
  getLaunchMenuBrand,
  type LaunchMenuBrand,
  type LaunchMenuItem,
} from "../src/lib/launch-menu-catalogue";
import {
  findLaunchMenuItem,
  toggleLaunchOption,
  type LaunchMenuSelections,
} from "../src/lib/launch-menu-picks";
import {
  cleanLaunchCrossConfiguration,
  getLaunchCrossOffers,
  isMappedLaunchUpgradeOption,
  launchCrossSelectionSummaries,
  priceForLaunchCrossChoice,
  setLaunchCrossChoice,
  type LaunchCrossSelection,
} from "../src/lib/launch-menu-upsells";

const loadedFries = "loadd-loaded-fries-king-of-hearts";
const loadedMac = "loadd-loaded-mac-cheese-ace-mac";
const blueWave = "moktl-mocktail-lounge-blue-wave";
const virginMojito = "moktl-mocktail-lounge-virgin-mojito";

function dish(brandId: string, sectionId: string) {
  const brand = getLaunchMenuBrand(brandId)!;
  return { brand, item: brand.sections.find((entry) => entry.id === sectionId)!.items[0]! };
}

function meal(brand: LaunchMenuBrand): LaunchMenuSelections {
  const group = `${brand.id}-make-it-a-meal`;
  return { [group]: [`${group}-make-it-a-meal`] };
}

function bothUpgrades(brand: LaunchMenuBrand, item: LaunchMenuItem, choices = meal(brand)) {
  const side = setLaunchCrossChoice(brand, item, choices, [], "loadd-side-upgrade", loadedFries);
  return setLaunchCrossChoice(
    brand,
    item,
    side.selections,
    side.crossSelections,
    "moktl-drink-upgrade",
    blueWave,
  );
}

describe("Owner-approved Load’d and Moktl planning choices", () => {
  test("offers named catalogue choices as extras or substitutions, never self-brand or Full House side targets", () => {
    const { brand, item } = dish("skorch", "beef-smash-deck");
    expect(
      getLaunchCrossOffers(brand, item, {}).map(({ mode, replaces }) => ({ mode, replaces })),
    ).toEqual([
      { mode: "extra", replaces: null },
      { mode: "extra", replaces: null },
    ]);
    const offers = getLaunchCrossOffers(brand, item, meal(brand));
    expect(offers.map(({ mode, replaces }) => ({ mode, replaces }))).toEqual([
      { mode: "upgrade", replaces: "fries" },
      { mode: "upgrade", replaces: "drink" },
    ]);
    expect(offers.map((offer) => offer.choices.length)).toEqual([9, 8]);
    for (const offer of offers) {
      expect(offer.brandId).not.toBe(brand.id);
      for (const choice of offer.choices) {
        const found = findLaunchMenuItem(choice.brandId, choice.itemId)!;
        expect(found.item.name).toBe(choice.name);
        expect(choice.pricePence).toBe(found.item.pricePence);
        expect(choice.pricePence).toBeGreaterThan(0);
        expect(["loaded-fries", "loaded-mac-cheese", "mocktail-lounge"]).toContain(
          found.section.id,
        );
      }
    }
    for (const sectionId of ["loaded-fries", "loaded-mac-cheese", "full-house"]) {
      const load = dish("loadd", sectionId);
      expect(getLaunchCrossOffers(load.brand, load.item, {}).map((offer) => offer.id)).toEqual([
        "moktl-drink-extra",
      ]);
    }
    for (const [brandId, sectionId] of [
      ["moktl", "mocktail-lounge"],
      ["loadd", "cans-drinks"],
      ["skorch", "sides"],
      ["tavo-chicken", "cans-drinks"],
    ]) {
      const excluded = dish(brandId!, sectionId!);
      expect(getLaunchCrossOffers(excluded.brand, excluded.item, {})).toEqual([]);
    }
    expect(
      getLaunchCrossOffers({ ...brand, id: "paratique" } as unknown as LaunchMenuBrand, item, {}),
    ).toEqual([]);
    expect(getLaunchCrossOffers(brand, { ...item, id: loadedFries }, {})).toEqual([]);
  });

  test("Tavo and Skorch kids already include fries and drink without a meal toggle", () => {
    for (const [brandId, sectionId] of [
      ["tavo-chicken", "kids-meals"],
      ["skorch", "kids-meal"],
    ]) {
      const { brand, item } = dish(brandId!, sectionId!);
      const config = bothUpgrades(brand, item, {});
      expect(config.selections).toEqual({});
      expect(config.crossSelections.map((choice) => choice.mode)).toEqual(["upgrade", "upgrade"]);
      expect(
        launchCrossSelectionSummaries(brand, item, config.selections, config.crossSelections).map(
          (entry) => entry.label,
        ),
      ).toEqual([
        "Meal fries replaced with Load’d · Loaded Fries: King of Hearts",
        "Meal drink replaced with Moktl · Blue Wave",
      ]);
    }
  });

  test("specific choices replace generic upgrades and alternate named targets occupy the same single slot", () => {
    const { brand, item } = dish("tavo-chicken", "burgers");
    const group = "tavo-chicken-meal-upgrades";
    const original = {
      ...meal(brand),
      [group]: [
        `${group}-loaded-fries-upgrade`,
        `${group}-loaded-mac-n-cheese-upgrade`,
        `${group}-mocktail-upgrade`,
      ],
      "tavo-chicken-burger-add-ons": ["tavo-chicken-burger-add-ons-cheese-slice"],
    };
    let config = bothUpgrades(brand, item, original);
    expect(config.selections[group]).toBeUndefined();
    expect(config.selections["tavo-chicken-burger-add-ons"]).toEqual([
      "tavo-chicken-burger-add-ons-cheese-slice",
    ]);
    expect(original[group]).toHaveLength(3);
    config = setLaunchCrossChoice(
      brand,
      item,
      config.selections,
      config.crossSelections,
      "loadd-side-upgrade",
      loadedMac,
    );
    config = setLaunchCrossChoice(
      brand,
      item,
      config.selections,
      config.crossSelections,
      "moktl-drink-upgrade",
      virginMojito,
    );
    expect(config.crossSelections.map((choice) => choice.itemId)).toEqual([
      loadedMac,
      virginMojito,
    ]);
    expect(isMappedLaunchUpgradeOption(`${group}-loaded-fries-upgrade`)).toBe(true);
    expect(isMappedLaunchUpgradeOption(`${group}-mocktail-upgrade`)).toBe(true);
    expect(isMappedLaunchUpgradeOption(`${group}-milkshake-upgrade`)).toBe(false);
    config = setLaunchCrossChoice(
      brand,
      item,
      config.selections,
      config.crossSelections,
      "loadd-side-upgrade",
      null,
    );
    expect(config.crossSelections.map((choice) => choice.slot)).toEqual(["drink"]);
  });

  test("unavailable milkshakes cannot replace a valid Moktl choice, while Peri Salt and Load’d remain exclusive", () => {
    const { brand, item } = dish("skorch", "beef-smash-deck");
    const group = "skorch-burgers-meal-upgrades";
    let config = bothUpgrades(brand, item);
    let source = toggleLaunchOption(brand, item, config.selections, group, `${group}-milkshake`);
    config = cleanLaunchCrossConfiguration(brand, item, source, config.crossSelections);
    expect(config.crossSelections.map((choice) => choice.slot)).toEqual(["side", "drink"]);
    expect(config.selections[group]).toBeUndefined();
    source = toggleLaunchOption(brand, item, config.selections, group, `${group}-peri-salt`);
    config = cleanLaunchCrossConfiguration(brand, item, source, config.crossSelections);
    expect(config.crossSelections.map((choice) => choice.slot)).toEqual(["drink"]);
    expect(config.selections[group]).toContain(`${group}-peri-salt`);
    config = setLaunchCrossChoice(
      brand,
      item,
      config.selections,
      config.crossSelections,
      "loadd-side-upgrade",
      loadedMac,
    );
    expect(config.crossSelections).toHaveLength(2);
    expect(config.selections[group]).toBeUndefined();
  });

  test("switching a Tavo or Skorch meal off removes upgrades without turning them into extras", () => {
    for (const brandId of ["tavo-chicken", "skorch"]) {
      const { brand, item } = dish(brandId, brandId === "skorch" ? "beef-smash-deck" : "burgers");
      const config = bothUpgrades(brand, item);
      const group = `${brand.id}-make-it-a-meal`;
      const main = toggleLaunchOption(
        brand,
        item,
        config.selections,
        group,
        `${group}-make-it-a-meal`,
      );
      expect(
        cleanLaunchCrossConfiguration(brand, item, main, config.crossSelections).crossSelections,
      ).toEqual([]);
      const extra = setLaunchCrossChoice(brand, item, main, [], "moktl-drink-extra", blueWave);
      expect(extra.crossSelections[0]?.mode).toBe("extra");
      expect(
        cleanLaunchCrossConfiguration(brand, item, meal(brand), extra.crossSelections)
          .crossSelections,
      ).toEqual([]);
    }
  });

  test("Souvano includes its side and offers only full-priced extras, without inventing a meal charge or replacement surcharge", () => {
    for (const sectionId of ["stir-fry-donner", "lamb-chops", "heatwave"]) {
      const { brand, item } = dish("souvano", sectionId);
      for (const side of ["fries", "rice", "naan"]) {
        const choices =
          sectionId === "heatwave"
            ? {
                "souvano-heatwave-base": [
                  `souvano-heatwave-base-${side === "rice" ? "fragrant-spicy-rice" : side}`,
                ],
              }
            : { "souvano-meal-side": [`souvano-meal-side-${side}`] };
        expect(getLaunchCrossOffers(brand, item, choices).map((offer) => offer.id)).toEqual([
          "loadd-side-extra",
          "moktl-drink-extra",
        ]);
        const stale = bothUpgrades(brand, item, choices);
        expect(stale.crossSelections).toEqual([]);
      }
    }
  });

  test("rejects forged targets, brands and modes; duplicate slots and browser amounts cannot add children", () => {
    const { brand, item } = dish("skorch", "beef-smash-deck");
    const valid: LaunchCrossSelection = {
      slot: "drink",
      mode: "upgrade",
      brandId: "moktl",
      itemId: blueWave,
    };
    const input = [
      {
        slot: "side",
        mode: "upgrade",
        brandId: "loadd",
        itemId: "loadd-full-house-king-of-hearts",
      },
      { ...valid, brandId: "skorch-burgers" },
      { ...valid, itemId: "moktl-cans-drinks-coke" },
      { ...valid, mode: "extra" },
      { ...valid, pricePence: 0, quantity: 20, name: "forged" },
      { ...valid, itemId: virginMojito },
      null,
    ];
    const clean = cleanLaunchCrossConfiguration(brand, item, meal(brand), input);
    expect(clean.crossSelections).toEqual([valid]);
    expect(launchCrossSelectionSummaries(brand, item, meal(brand), input)[0]?.pricePence).toBe(299);
    expect(cleanLaunchCrossConfiguration(brand, item, {}, input).crossSelections).toEqual([
      { ...valid, mode: "extra" },
    ]);
    expect(cleanLaunchCrossConfiguration(brand, item, {}, [valid]).crossSelections).toEqual([]);
    expect(
      cleanLaunchCrossConfiguration(brand, item, meal(brand), { child: valid }).crossSelections,
    ).toEqual([]);
  });

  test("replacement surcharges stay independent from a target product’s standalone price", () => {
    expect(priceForLaunchCrossChoice("extra", 3_500, "loaded-fries")).toBe(3_500);
    expect(priceForLaunchCrossChoice("upgrade", 3_500, "loaded-fries")).toBe(299);
    expect(priceForLaunchCrossChoice("upgrade", 3_500, "loaded-mac-cheese")).toBe(399);
    expect(priceForLaunchCrossChoice("upgrade", 3_500, "mocktail-lounge")).toBe(299);
    expect(priceForLaunchCrossChoice("upgrade", 3_500, "full-house")).toBeNull();
  });
});
