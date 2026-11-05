import { describe, expect, test } from "bun:test";
import { getLaunchMenuBrand, getLaunchMenuPriceVariant } from "../src/lib/launch-menu-catalogue";
import { launchMenuBasketDisplayPrice } from "../src/lib/launch-menu-display-prices";
import {
  addLaunchPick,
  encodeLaunchPicks,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "../src/lib/launch-menu-picks";
import type { LaunchCrossSelection } from "../src/lib/launch-menu-upsells";
import {
  checkoutModifierId,
  normaliseCheckoutSelection,
} from "../src/lib/mealdeck-checkout-selection";
import {
  acceptGroupReply,
  addGroupPerson,
  buildGroupCheckout,
  createGroupPlan,
  decodeGroupPlan,
  encodeGroupPlan,
  groupInvitation,
  groupPersonLabel,
  groupPlanCount,
  GroupPlanProblem,
  inspectGroupReply,
  makeGroupLink,
  makeGroupReply,
  MAX_GROUP_LINK_LENGTH,
  MAX_GROUP_PEOPLE,
  parseGroupLink,
  removeGroupPerson,
  updateOrganiserPicks,
  validateGroupPicks,
  type GroupPlan,
} from "../src/lib/mealdeck-group-plan";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const groupId = id(1);
const guestId = id(2);
const secondGuestId = id(3);
const tenantId = id(900);
const blueWave = "moktl-mocktail-lounge-blue-wave";
const mojito = "moktl-mocktail-lounge-virgin-mojito";
const rushHour = "moktl-mocktail-lounge-rush-hour";
const wings = "tavo-chicken-fried-chicken-wings-fried-chicken-wings";
const fries = "loadd-loaded-fries-king-of-hearts";
const ace = "skorch-burgers-beef-smash-deck-the-ace";
type WirePick = Omit<LaunchMenuPick, "key">;

function picks(
  brandId: string,
  itemId: string,
  selections: LaunchMenuSelections = {},
  quantity = 1,
  crossSelections: LaunchCrossSelection[] = [],
) {
  const result = addLaunchPick([], brandId, itemId, selections, quantity, crossSelections);
  expect(result).toHaveLength(1);
  return result;
}

const drink = (quantity = 1, itemId = blueWave) => picks("moktl", itemId, {}, quantity);
const wire = (value: LaunchMenuPick[]): WirePick[] =>
  (JSON.parse(encodeLaunchPicks(value)) as { picks: WirePick[] }).picks;
const fragment = (value: unknown) =>
  "#g=" + Buffer.from(JSON.stringify(value)).toString("base64url");
const group = () => addGroupPerson(createGroupPlan(groupId), "Alex private label", guestId);
const invite = () => groupInvitation(group(), guestId);
const reply = (value = drink(), responseId = id(10)) => makeGroupReply(invite(), value, responseId);
const rawReply = (value: unknown = wire(drink())) => ({
  version: 1,
  kind: "reply",
  groupId,
  inviteId: guestId,
  responseId: id(10),
  picks: value,
});

function tavoMeal(quantity = 1, flavour = "fiery-sweet-chilli") {
  return picks(
    "tavo-chicken",
    wings,
    {
      "tavo-chicken-portion": ["tavo-chicken-portion-8-pcs"],
      "tavo-chicken-flavour": [`tavo-chicken-flavour-${flavour}`],
      "tavo-chicken-make-it-a-meal": ["tavo-chicken-make-it-a-meal-make-it-a-meal"],
    },
    quantity,
    [
      { slot: "side", mode: "upgrade", brandId: "loadd", itemId: fries },
      { slot: "drink", mode: "upgrade", brandId: "moktl", itemId: blueWave },
    ],
  );
}

function quoteFor(plan: GroupPlan) {
  const transfer = buildGroupCheckout(plan);
  return {
    action: "quote",
    fulfilment: "pickup",
    picks: wire(transfer.picks),
    packing: { ...transfer.packing, cutleryRequested: true },
  };
}

describe("group links are strict menu choices, with no identity or price authority", () => {
  test("round-trips invitation and reply fragments without exposing local names or prices", () => {
    const invitation = invite();
    const invitationUrl = new URL(makeGroupLink(invitation, "https://mealdeck.co.uk"));
    expect(invitationUrl.pathname).toBe("/group-order");
    expect(invitationUrl.search).toBe("");
    expect(parseGroupLink(invitationUrl.href)).toEqual(invitation);
    expect(parseGroupLink(invitationUrl.hash)).toEqual(invitation);
    expect(JSON.parse(Buffer.from(invitationUrl.hash.slice(3), "base64url").toString())).toEqual({
      version: 1,
      kind: "invite",
      groupId,
      inviteId: guestId,
    });

    const chosen = reply(tavoMeal(2));
    const replyUrl = new URL(makeGroupLink(chosen, "https://www.mealdeck.co.uk"));
    const payload = JSON.parse(Buffer.from(replyUrl.hash.slice(3), "base64url").toString());
    expect(payload).toEqual(rawReply(wire(chosen.picks)));
    expect(payload.picks[0]).not.toHaveProperty("key");
    expect(JSON.stringify(payload)).not.toMatch(
      /Alex|label|email|phone|customer|tenant|price|paid|total/i,
    );
    expect(parseGroupLink(replyUrl.href)).toEqual(chosen);
    expect(parseGroupLink("  " + replyUrl.hash + "  ")).toEqual(chosen);
    expect(
      parseGroupLink(makeGroupLink(invitation, "http://localhost:5173"), "http://localhost:5173"),
    ).toEqual(invitation);
  });

  test("rejects non-MealDeck URLs, query data, credentials and malformed or oversized fragments", () => {
    const hash = fragment(invite());
    for (const input of [
      "https://attacker.example/group-order" + hash,
      "https://mealdeck.co.uk.evil.example/group-order" + hash,
      "https://mealdeck.co.uk/menu" + hash,
      "https://mealdeck.co.uk/group-order?paid=true" + hash,
      "https://user:secret@mealdeck.co.uk/group-order" + hash,
      "http://mealdeck.co.uk/group-order" + hash,
      "not a link",
      "",
      "#g=",
      "#g=%%%",
      "#g=YQ==",
      "#g=_w", // Invalid UTF-8, not a replacement-character JSON decode.
      "#g=" + Buffer.from("not JSON").toString("base64url"),
      hash + "&paid=true",
      "#g=" + "a".repeat(MAX_GROUP_LINK_LENGTH),
    ])
      expect(() => parseGroupLink(input)).toThrow(GroupPlanProblem);
    expect(() => makeGroupLink(invite(), "ftp://mealdeck.co.uk")).toThrow(GroupPlanProblem);
  });

  test("rejects forged authority fields, invalid IDs and unsupported link versions", () => {
    for (const payload of [
      { ...invite(), version: 2 },
      { ...invite(), kind: "payment" },
      { ...invite(), groupId: "-".repeat(36) },
      { ...invite(), inviteId: "organiser" },
      { ...invite(), email: "person@example.test" },
      { ...rawReply(), customerId: id(99) },
      { ...rawReply(), totalPence: 1 },
      { ...rawReply(), paid: true },
      { ...rawReply(), responseId: "not-a-uuid" },
      { ...rawReply(), picks: [] },
      { ...rawReply(), picks: Array.from({ length: 61 }, () => wire(drink())[0]) },
    ])
      expect(() => parseGroupLink(fragment(payload))).toThrow(GroupPlanProblem);
  });

  test("never silently discards forged, stale, duplicate, unavailable or incomplete options", () => {
    const plain = wire(drink())[0]!;
    const chicken = wire(tavoMeal())[0]!;
    const burger = wire(picks("skorch-burgers", ace))[0]!;
    const invalid: unknown[] = [
      { ...plain, pricePence: 1 },
      { ...plain, key: "trusted-key" },
      { ...plain, brandId: "retired-brand" },
      { ...plain, itemId: "moktl-retired-drink" },
      { ...plain, brandId: "loadd" },
      { ...plain, quantity: 0 },
      { ...plain, quantity: 21 },
      { ...plain, quantity: 1.5 },
      { ...plain, quantity: "1" },
      { ...plain, selections: { "unknown-group": ["unknown-option"] } },
      { ...chicken, selections: {} },
      {
        ...chicken,
        selections: { ...chicken.selections, "tavo-chicken-flavour": ["invented-free-flavour"] },
      },
      {
        ...chicken,
        selections: {
          ...chicken.selections,
          "tavo-chicken-portion": ["tavo-chicken-portion-8-pcs", "tavo-chicken-portion-3-pcs"],
        },
      },
      {
        ...chicken,
        selections: {
          ...chicken.selections,
          "tavo-chicken-portion": ["tavo-chicken-portion-8-pcs", "tavo-chicken-portion-8-pcs"],
        },
      },
      {
        ...burger,
        selections: {
          "skorch-burgers-make-it-a-meal": ["skorch-burgers-make-it-a-meal-make-it-a-meal"],
        },
      },
      {
        ...burger,
        selections: {
          "skorch-burgers-make-it-a-meal": ["skorch-burgers-make-it-a-meal-make-it-a-meal"],
          "skorch-burgers-meal-upgrades": ["skorch-burgers-meal-upgrades-milkshake"],
        },
      },
      {
        ...burger,
        selections: {
          "skorch-burgers-burger-add-ons": [
            "skorch-burgers-burger-add-ons-cheese-slice",
            "skorch-burgers-burger-add-ons-cheese-slice",
          ],
        },
      },
      { ...chicken, crossSelections: [chicken.crossSelections![0], chicken.crossSelections![0]] },
      {
        ...chicken,
        crossSelections: chicken.crossSelections!.map((choice) => ({ ...choice, totalPence: 1 })),
      },
      {
        ...chicken,
        crossSelections: [{ slot: "side", mode: "upgrade", brandId: "moktl", itemId: blueWave }],
      },
      {
        ...plain,
        crossSelections: [{ slot: "side", mode: "upgrade", brandId: "loadd", itemId: fries }],
      },
    ];
    for (const invalidPick of invalid) {
      const incoming = [plain, invalidPick];
      const before = JSON.stringify(incoming);
      expect(() => validateGroupPicks(incoming)).toThrow(GroupPlanProblem);
      expect(() => parseGroupLink(fragment(rawReply(incoming)))).toThrow(GroupPlanProblem);
      expect(JSON.stringify(incoming)).toBe(before);
    }
  });

  test("keeps exact canonical choices while merging equivalent option orderings", () => {
    const original = wire(tavoMeal())[0]!;
    const reordered = {
      ...original,
      quantity: 2,
      selections: Object.fromEntries(Object.entries(original.selections).reverse()),
      crossSelections: [...original.crossSelections!].reverse(),
    };
    expect(validateGroupPicks([original, reordered])).toEqual(tavoMeal(3));
    expect(validateGroupPicks([])).toEqual([]);
  });
});

describe("organiser review and invitation scope", () => {
  test("keeps names local, validates short labels and retains the organiser's bag", () => {
    expect(groupPersonLabel("  Alex   Smith\n ")).toBe("Alex Smith");
    expect(groupPersonLabel("A".repeat(32))).toHaveLength(32);
    for (const label of ["", "   ", "A".repeat(33), "Alex\u0000Smith", "Alex\u007fSmith"])
      expect(() => groupPersonLabel(label)).toThrow(GroupPlanProblem);
    expect(() => createGroupPlan("fake")).toThrow(GroupPlanProblem);
    expect(() => addGroupPerson(group(), "Duplicate", guestId)).toThrow(GroupPlanProblem);
    expect(() => removeGroupPerson(group(), "organiser")).toThrow(GroupPlanProblem);
    expect(() => groupInvitation(group(), "organiser")).toThrow(GroupPlanProblem);
    expect(() => groupInvitation(group(), id(99))).toThrow(GroupPlanProblem);
    expect(() => makeGroupReply(invite(), [])).toThrow(GroupPlanProblem);
    expect(() => buildGroupCheckout(group())).toThrow(GroupPlanProblem);
  });

  test("cannot import another group's reply or a removed person's old invitation", () => {
    const plan = group();
    const incoming = reply();
    const otherGroup = addGroupPerson(createGroupPlan(id(99)), "Alex", guestId);
    expect(() => inspectGroupReply(otherGroup, incoming)).toThrow(/different group/);
    const removed = removeGroupPerson(plan, guestId);
    expect(() => acceptGroupReply(removed, incoming)).toThrow(/no longer/);
    const reinvited = addGroupPerson(removed, "Alex", secondGuestId);
    expect(() => acceptGroupReply(reinvited, incoming)).toThrow(/no longer/);
    expect(plan.people).toHaveLength(2);
    expect(plan.people[1]!.picks).toEqual([]);
  });

  test("reviews new choices, replaces a changed response and never appends duplicate quantities", () => {
    const plan = updateOrganiserPicks(group(), drink(1, mojito));
    const before = encodeGroupPlan(plan);
    const first = reply(drink(2), id(10));
    expect(inspectGroupReply(plan, first).status).toBe("new");
    const accepted = acceptGroupReply(plan, first);
    expect(groupPlanCount(accepted)).toBe(3);
    expect(accepted.revision).toBe(plan.revision + 1);
    expect(encodeGroupPlan(plan)).toBe(before);
    expect(inspectGroupReply(accepted, first).status).toBe("unchanged");
    expect(acceptGroupReply(accepted, first)).toBe(accepted);

    const changed = reply(drink(4, rushHour), id(11));
    expect(inspectGroupReply(accepted, changed).status).toBe("replace");
    const replaced = acceptGroupReply(accepted, changed);
    expect(groupPlanCount(replaced)).toBe(5);
    expect(replaced.people[1]!.picks).toEqual(drink(4, rushHour));
    expect(replaced.people[1]!.reviewedResponseIds).toEqual([id(10), id(11)]);
    expect(inspectGroupReply(replaced, first).status).toBe("older");
    expect(() => acceptGroupReply(replaced, first)).toThrow(/older reply/);
    expect(groupPlanCount(replaced)).toBe(5);
  });

  test("reusing a current response ID with changed picks cannot alter the accepted bag", () => {
    const accepted = acceptGroupReply(group(), reply(drink(2), id(10)));
    const altered = reply(drink(3, mojito), id(10));
    expect(() => inspectGroupReply(accepted, altered)).toThrow(/already used/);
    expect(() => acceptGroupReply(accepted, altered)).toThrow(/already used/);
    expect(accepted.people[1]!.picks).toEqual(drink(2));
  });

  test("remembering an acknowledged identical reply prevents replay after a later change", () => {
    const first = reply(drink(2), id(10));
    const sameChoices = reply(drink(2), id(11));
    const latest = reply(drink(3, mojito), id(12));
    const accepted = acceptGroupReply(group(), first);
    expect(inspectGroupReply(accepted, sameChoices).status).toBe("unchanged");
    const acknowledged = acceptGroupReply(accepted, sameChoices);
    expect(acknowledged.people[1]!.picks).toEqual(drink(2));
    expect(acknowledged.people[1]!.reviewedResponseIds).toContain(id(11));
    const changed = acceptGroupReply(acknowledged, latest);
    expect(inspectGroupReply(changed, sameChoices).status).toBe("older");
    expect(() => acceptGroupReply(changed, sameChoices)).toThrow(/older reply/);
    expect(changed.people[1]!.picks).toEqual(drink(3, mojito));
  });

  test("caps reviewed reply history without discarding IDs that protect against replay", () => {
    let plan = group();
    let last = reply();
    for (let index = 0; index < 100; index++) {
      last = reply(drink(index % 2 ? 2 : 1), id(1000 + index));
      plan = acceptGroupReply(plan, last);
    }
    expect(plan.people[1]!.reviewedResponseIds).toHaveLength(100);
    expect(acceptGroupReply(plan, last)).toBe(plan);
    const before = encodeGroupPlan(plan);
    expect(() => acceptGroupReply(plan, reply(drink(3), id(2000)))).toThrow(/fresh invitation/);
    expect(encodeGroupPlan(plan)).toBe(before);
  });
});

describe("group quantity limits and stored drafts", () => {
  test("allows ten people including the organiser, then rejects atomically", () => {
    let plan = createGroupPlan(groupId);
    for (let index = 1; index < MAX_GROUP_PEOPLE; index++)
      plan = addGroupPerson(plan, `Person ${index}`, id(30 + index));
    expect(plan.people).toHaveLength(10);
    const before = encodeGroupPlan(plan);
    expect(() => addGroupPerson(plan, "Eleventh", id(60))).toThrow(/10 people/);
    expect(encodeGroupPlan(plan)).toBe(before);
  });

  test("enforces twenty of the same configuration across people without partial imports", () => {
    const plan = updateOrganiserPicks(group(), drink(20));
    const before = encodeGroupPlan(plan);
    expect(() => acceptGroupReply(plan, reply(drink(1)))).toThrow(/20 of each/);
    expect(encodeGroupPlan(plan)).toBe(before);
    expect(() => validateGroupPicks([...wire(drink(20)), ...wire(drink(1))])).toThrow(/20 of each/);
    const different = acceptGroupReply(plan, reply(drink(20, mojito)));
    expect(groupPlanCount(different)).toBe(40);
  });

  test("enforces the sixty-item group cap across different people and configurations", () => {
    let plan = updateOrganiserPicks(group(), [...drink(20), ...drink(20, mojito)]);
    plan = acceptGroupReply(plan, reply(drink(20, rushHour)));
    plan = addGroupPerson(plan, "One more", secondGuestId);
    expect(groupPlanCount(plan)).toBe(60);
    const before = encodeGroupPlan(plan);
    const incoming = makeGroupReply(
      groupInvitation(plan, secondGuestId),
      picks("skorch-burgers", ace),
      id(90),
    );
    expect(() => acceptGroupReply(plan, incoming)).toThrow(/60 selections/);
    expect(() =>
      updateOrganiserPicks(plan, [
        ...drink(20),
        ...drink(20, mojito),
        ...picks("skorch-burgers", ace),
      ]),
    ).toThrow(/60 selections/);
    expect(encodeGroupPlan(plan)).toBe(before);
  });

  test("round-trips a saved draft including review history and canonical configuration keys", () => {
    const plan = acceptGroupReply(updateOrganiserPicks(group(), tavoMeal()), reply(drink(2)));
    const encoded = encodeGroupPlan(plan);
    expect(encoded).not.toContain('"key":');
    expect(decodeGroupPlan(encoded)).toEqual(plan);
  });

  test("rejects corrupt saved plans as a whole instead of restoring a smaller order", () => {
    const valid = JSON.parse(encodeGroupPlan(acceptGroupReply(group(), reply()))) as GroupPlan;
    const person = valid.people[1]!;
    const invalid = [
      { ...valid, version: 2 },
      { ...valid, revision: -1 },
      { ...valid, totalPence: 1 },
      { ...valid, people: [] },
      { ...valid, people: [person, valid.people[0]] },
      { ...valid, people: [...valid.people, person] },
      { ...valid, people: [{ ...valid.people[0], label: "A".repeat(33) }, person] },
      {
        ...valid,
        people: [
          valid.people[0],
          { ...person, picks: [{ ...person.picks[0], itemId: "retired" }] },
        ],
      },
      {
        ...valid,
        people: [
          { ...valid.people[0], picks: wire(drink(20)) },
          { ...person, picks: wire(drink()) },
        ],
      },
      { ...valid, people: [valid.people[0], { ...person, responseId: "-".repeat(36) }] },
    ];
    for (const input of invalid)
      expect(() => decodeGroupPlan(JSON.stringify(input))).toThrow(GroupPlanProblem);
    expect(() => decodeGroupPlan("{")).toThrow(GroupPlanProblem);
    expect(() => decodeGroupPlan(" ".repeat(200_001))).toThrow(GroupPlanProblem);
  });
});

describe("group checkout uses the existing canonical pricing and packing contract", () => {
  test("merges identical Tavo meals, preserves exact variants and prices named replacements once", () => {
    let plan = updateOrganiserPicks(group(), tavoMeal(1));
    plan = acceptGroupReply(plan, reply(tavoMeal(2)));
    plan = addGroupPerson(plan, "Different flavour", secondGuestId);
    plan = acceptGroupReply(
      plan,
      makeGroupReply(groupInvitation(plan, secondGuestId), tavoMeal(1, "korean-bbq"), id(11)),
    );
    const transfer = buildGroupCheckout(plan);
    expect(transfer.picks).toHaveLength(2);
    expect(transfer.picks.map((pick) => pick.quantity)).toEqual([3, 1]);
    expect(transfer.packing.allocations).toEqual([
      { lineId: "line-1", bag: 1, quantity: 1 },
      { lineId: "line-1", bag: 2, quantity: 2 },
      { lineId: "line-2", bag: 3, quantity: 1 },
    ]);
    // Display only: 899/799 exact base + 250 meal + 299 side + 299 drink per unit.
    expect(launchMenuBasketDisplayPrice(transfer.picks).itemsSubtotalPence).toBe(6_888);

    const quote = quoteFor(plan);
    const canonical = normaliseCheckoutSelection(quote, tenantId);
    expect(canonical.lines).toHaveLength(2);
    for (const [index, pick] of transfer.picks.entries()) {
      const variant = getLaunchMenuPriceVariant(pick.brandId, pick.itemId, pick.selections)!;
      const line = canonical.lines[index]!;
      expect(variant.pricePence).toBe(index === 0 ? 899 : 799);
      expect(line.sku).toBe(wings);
      expect(line.quantity).toBe(index === 0 ? 3 : 1);
      expect(line.modifiers.filter((modifier) => modifier.kind === "variant")).toEqual([
        {
          groupId: checkoutModifierId(tenantId, "group", variant.groupId),
          optionId: checkoutModifierId(tenantId, "option", variant.optionId),
          kind: "variant",
        },
      ]);
      expect(line.modifiers.filter((modifier) => modifier.kind === "cross")).toEqual([
        {
          groupId: checkoutModifierId(tenantId, "group", "cross-side-replacement"),
          optionId: checkoutModifierId(tenantId, "option", "cross-side-replacement-" + fries),
          kind: "cross",
          targetSku: fries,
        },
        {
          groupId: checkoutModifierId(tenantId, "group", "cross-drink-replacement"),
          optionId: checkoutModifierId(tenantId, "option", "cross-drink-replacement-" + blueWave),
          kind: "cross",
          targetSku: blueWave,
        },
      ]);
    }
    expect(JSON.stringify(quote)).not.toMatch(/Alex|Different flavour|groupId|pricePence|"key"/);
    expect(JSON.stringify(canonical)).not.toMatch(/Alex|Different flavour|6888/);
    expect(() =>
      normaliseCheckoutSelection(
        { ...quote, picks: quote.picks.map((pick) => ({ ...pick, pricePence: 1 })) },
        tenantId,
      ),
    ).toThrow();
  });

  test("keeps the distinct grilled-wing flavour matrix through a share and server normalization", () => {
    const brand = getLaunchMenuBrand("tavo-chicken")!;
    const grilled = brand.sections.find((section) => section.id === "grilled-chicken-wings")!
      .items[0]!;
    const chosen = picks("tavo-chicken", grilled.id, {
      "tavo-chicken-portion": ["tavo-chicken-portion-8-pcs"],
      "tavo-grilled-chicken-flavour": ["tavo-grilled-chicken-flavour-spicy-honey-bbq"],
    });
    const parsed = parseGroupLink(makeGroupLink(reply(chosen), "https://mealdeck.co.uk"));
    expect(parsed.kind).toBe("reply");
    if (parsed.kind !== "reply") throw new Error("Expected a reply");
    const plan = acceptGroupReply(group(), parsed);
    const canonical = normaliseCheckoutSelection(quoteFor(plan), tenantId);
    const variant = getLaunchMenuPriceVariant("tavo-chicken", grilled.id, chosen[0]!.selections)!;
    expect(variant.pricePence).toBe(699);
    expect(canonical.lines[0]!.modifiers).toContainEqual({
      groupId: checkoutModifierId(tenantId, "group", variant.groupId),
      optionId: checkoutModifierId(tenantId, "option", variant.optionId),
      kind: "variant",
    });
    const invalid = {
      ...wire(chosen)[0]!,
      selections: {
        "tavo-chicken-portion": ["tavo-chicken-portion-8-pcs"],
        "tavo-grilled-chicken-flavour": ["tavo-grilled-chicken-flavour-korean-bbq"],
      },
    };
    expect(() => validateGroupPicks([invalid])).toThrow(GroupPlanProblem);
  });

  test("assigns every parent's side and drink extras to the same numbered person bag", () => {
    const souvano = (quantity: number) =>
      picks(
        "souvano",
        "souvano-lamb-chops-lamb-chops",
        { "souvano-meal-side": ["souvano-meal-side-naan"] },
        quantity,
        [
          { slot: "side", mode: "extra", brandId: "loadd", itemId: fries },
          { slot: "drink", mode: "extra", brandId: "moktl", itemId: blueWave },
        ],
      );
    let plan = addGroupPerson(group(), "Empty invitation", secondGuestId);
    plan = addGroupPerson(plan, "Taylor", id(4));
    plan = acceptGroupReply(plan, reply(souvano(1)));
    plan = acceptGroupReply(plan, makeGroupReply(groupInvitation(plan, id(4)), souvano(2), id(11)));
    const transfer = buildGroupCheckout(plan);
    expect(transfer.bags).toEqual([
      { number: 1, label: "Alex private label" },
      { number: 2, label: "Taylor" },
    ]);
    expect(transfer.picks).toHaveLength(1);
    expect(transfer.picks[0]!.quantity).toBe(3);
    expect(transfer.picks[0]!.selections).toEqual({
      "souvano-meal-side": ["souvano-meal-side-naan"],
    });
    const canonical = normaliseCheckoutSelection(quoteFor(plan), tenantId);
    expect(
      canonical.lines.map(({ lineId, parentLineId, sku, quantity }) => ({
        lineId,
        parentLineId,
        sku,
        quantity,
      })),
    ).toEqual([
      { lineId: "line-1-extra-side", parentLineId: "line-1", sku: fries, quantity: 3 },
      { lineId: "line-1-extra-drink", parentLineId: "line-1", sku: blueWave, quantity: 3 },
      { lineId: "line-1", parentLineId: null, sku: "souvano-lamb-chops-lamb-chops", quantity: 3 },
    ]);
    expect(canonical.packingPlan).toEqual({
      version: 1,
      separateBags: true,
      cutleryRequested: true,
      bags: [1, 2].map((number) => ({
        number,
        allocations: ["line-1", "line-1-extra-side", "line-1-extra-drink"].map((lineId) => ({
          lineId,
          quantity: number,
        })),
      })),
    });
    expect(canonical.lines.find((line) => line.parentLineId === null)!.modifiers).toContainEqual({
      groupId: checkoutModifierId(tenantId, "group", "souvano-meal-side"),
      optionId: checkoutModifierId(tenantId, "option", "souvano-meal-side-naan"),
      kind: "source",
    });
    for (const line of canonical.lines)
      expect(
        canonical.packingPlan.bags
          .flatMap((bag) => bag.allocations)
          .filter((allocation) => allocation.lineId === line.lineId)
          .reduce((total, allocation) => total + allocation.quantity, 0),
      ).toBe(line.quantity);
  });
});
