import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CHECKOUT_BASKET_HANDOFF_KEY,
  CHECKOUT_GROUP_HANDOFF_KEY,
  clearLaunchCheckoutTransfer,
  parseLaunchCheckoutGroup,
  prepareGroupCheckout,
  prepareLaunchCheckout,
  readLaunchCheckoutGroup,
  readLaunchCheckoutPicks,
  readLaunchCheckoutTransfer,
} from "../src/lib/launch-basket-transfer";
import {
  addLaunchPick,
  encodeLaunchPicks,
  LAUNCH_PICKS_STORAGE_KEY,
  type LaunchMenuPick,
} from "../src/lib/launch-menu-picks";
import {
  emptyTimedLaunchBasket,
  encodeTimedLaunchBasket,
  updateTimedLaunchBasket,
  LAUNCH_BASKET_EXPIRY_NOTICE,
  LAUNCH_BASKET_TTL_MS,
} from "../src/lib/launch-basket-expiration";
import {
  acceptGroupReply,
  addGroupPerson,
  buildGroupCheckout,
  createGroupPlan,
  encodeGroupPlan,
  GROUP_PLAN_STORAGE_KEY,
  groupInvitation,
  GroupPlanProblem,
  makeGroupReply,
  updateOrganiserPicks,
  type GroupCheckoutTransfer,
  type GroupInvitation,
} from "../src/lib/mealdeck-group-plan";
import {
  assertStoredGroupPlanCurrent,
  readGroupReplyDraft,
  readStoredGroupPlan,
  saveGroupReplyDraft,
  saveStoredGroupPlan,
} from "../src/lib/mealdeck-group-storage";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const blueWave = "moktl-mocktail-lounge-blue-wave";
const mojito = "moktl-mocktail-lounge-virgin-mojito";
const drink = (quantity = 1, itemId = blueWave) => addLaunchPick([], "moktl", itemId, {}, quantity);
const personalPicks = addLaunchPick(
  [],
  "skorch-burgers",
  "skorch-burgers-beef-smash-deck-the-ace",
  {},
);
// Personal baskets now have a strict, per-quantity 20-minute deadline.
// Group-room snapshots keep their independent frozen/payment rules.
const timed = (picks: LaunchMenuPick[], at = Date.now()) =>
  updateTimedLaunchBasket(emptyTimedLaunchBasket(), picks, at);
let personalRaw: string;

class TestStorage implements Storage {
  values = new Map<string, string>();
  failReads = false;
  failWrites = false;
  failRemoves = false;

  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    if (this.failReads) throw new Error("Storage access is blocked");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("Storage quota exceeded");
    this.values.set(key, String(value));
  }
  removeItem(key: string) {
    if (this.failRemoves) throw new Error("Storage access is blocked");
    this.values.delete(key);
  }
}

const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
let local: TestStorage;
let session: TestStorage;
let invitationSequence = 500;

beforeEach(() => {
  local = new TestStorage();
  session = new TestStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });
  clearLaunchCheckoutTransfer();
  // A successful save resets this module's intentionally persistent memory fallback.
  saveStoredGroupPlan(createGroupPlan(id(9999)), null, true);
  local.clear();
  personalRaw = encodeTimedLaunchBasket(timed(personalPicks));
  local.setItem(LAUNCH_PICKS_STORAGE_KEY, personalRaw);
  local.setItem("unrelated-preference", "preserved");
});

afterEach(() => {
  session.failReads = session.failWrites = session.failRemoves = false;
  local.failReads = local.failWrites = local.failRemoves = false;
  clearLaunchCheckoutTransfer();
  saveStoredGroupPlan(createGroupPlan(id(9999)), null, true);
  if (originalLocal) Object.defineProperty(globalThis, "localStorage", originalLocal);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

function planWithBags() {
  let plan = addGroupPerson(createGroupPlan(id(1)), "Alex local label", id(2));
  plan = updateOrganiserPicks(plan, drink(1));
  return acceptGroupReply(plan, makeGroupReply(groupInvitation(plan, id(2)), drink(2), id(3)));
}

function metadata(transfer: GroupCheckoutTransfer = buildGroupCheckout(planWithBags())) {
  return {
    version: 1,
    basket: encodeLaunchPicks(transfer.picks),
    groupId: transfer.groupId,
    packing: transfer.packing,
    bags: transfer.bags,
  };
}

function seedColdTransfer(basket: string | null, group: string | null) {
  clearLaunchCheckoutTransfer();
  if (basket !== null) session.setItem(CHECKOUT_BASKET_HANDOFF_KEY, basket);
  if (group !== null) session.setItem(CHECKOUT_GROUP_HANDOFF_KEY, group);
}

function expectPersonalUntouched() {
  expect(local.values.get(LAUNCH_PICKS_STORAGE_KEY)).toBe(personalRaw);
  expect(local.values.get("unrelated-preference")).toBe("preserved");
}

function freshInvite(): GroupInvitation {
  return {
    version: 1,
    kind: "invite",
    groupId: id(++invitationSequence),
    inviteId: id(++invitationSequence),
  };
}

const replyKey = (invite: GroupInvitation) =>
  `mealdeck-group-reply-v1:${invite.groupId}:${invite.inviteId}`;

describe("group checkout handoff remains separate from the personal basket", () => {
  test("transfers merged choices with exact local bag labels, leaving the personal basket intact", () => {
    const transfer = buildGroupCheckout(planWithBags());
    prepareGroupCheckout(transfer);
    expect(readLaunchCheckoutPicks()).toEqual(transfer.picks);
    expect(readLaunchCheckoutGroup(transfer.picks)).toEqual({
      groupId: transfer.groupId,
      packing: transfer.packing,
      bags: transfer.bags,
    });
    expect(readLaunchCheckoutTransfer(true)).toEqual({
      picks: transfer.picks,
      group: { groupId: transfer.groupId, packing: transfer.packing, bags: transfer.bags },
      issue: null,
    });
    expect(session.getItem(CHECKOUT_BASKET_HANDOFF_KEY)).toBe(encodeLaunchPicks(transfer.picks));
    expect(session.getItem(CHECKOUT_GROUP_HANDOFF_KEY)).toBe(JSON.stringify(metadata(transfer)));
    expectPersonalUntouched();
  });

  test("restores a complete saved group after a route reload without using personal picks", () => {
    const transfer = buildGroupCheckout(planWithBags());
    prepareGroupCheckout(transfer);
    const basket = session.getItem(CHECKOUT_BASKET_HANDOFF_KEY);
    const group = session.getItem(CHECKOUT_GROUP_HANDOFF_KEY);
    seedColdTransfer(basket, group);
    expect(readLaunchCheckoutTransfer(true)).toEqual({
      picks: transfer.picks,
      group: { groupId: transfer.groupId, packing: transfer.packing, bags: transfer.bags },
      issue: null,
    });
    expectPersonalUntouched();
  });

  test("an ordinary checkout clears group metadata and clearing a handoff preserves personal picks", () => {
    prepareGroupCheckout(buildGroupCheckout(planWithBags()));
    const ordinary = drink(2, mojito);
    prepareLaunchCheckout(ordinary, timed(ordinary));
    expect(readLaunchCheckoutPicks()).toEqual(ordinary);
    expect(readLaunchCheckoutGroup(ordinary)).toBeNull();
    expect(session.getItem(CHECKOUT_GROUP_HANDOFF_KEY)).toBeNull();
    expect(readLaunchCheckoutTransfer()).toEqual({ picks: ordinary, group: null, issue: null });
    clearLaunchCheckoutTransfer();
    expect(session.getItem(CHECKOUT_BASKET_HANDOFF_KEY)).toBeNull();
    expect(session.getItem(CHECKOUT_GROUP_HANDOFF_KEY)).toBeNull();
    expect(readLaunchCheckoutPicks()).toEqual(personalPicks);
    expectPersonalUntouched();
  });

  test("expired ordinary items cannot be resurrected from a valid group handoff", () => {
    const group = buildGroupCheckout(planWithBags());
    prepareGroupCheckout(group);
    const ordinary = drink(1, mojito);
    expect(() =>
      prepareLaunchCheckout(ordinary, timed(ordinary, Date.now() - LAUNCH_BASKET_TTL_MS - 1)),
    ).toThrow(LAUNCH_BASKET_EXPIRY_NOTICE);
    expect(readLaunchCheckoutTransfer(true).picks).toEqual(group.picks);
    expectPersonalUntouched();
  });

  test("an explicitly empty ordinary handoff never falls back to the saved personal basket", () => {
    prepareLaunchCheckout([], emptyTimedLaunchBasket());
    expect(readLaunchCheckoutPicks()).toEqual([]);
    expect(readLaunchCheckoutTransfer()).toEqual({ picks: [], group: null, issue: null });
    expectPersonalUntouched();
  });

  test("invalid outgoing packing does not overwrite the previously prepared checkout", () => {
    const transfer = buildGroupCheckout(planWithBags());
    prepareGroupCheckout(transfer);
    const basket = session.getItem(CHECKOUT_BASKET_HANDOFF_KEY);
    const group = session.getItem(CHECKOUT_GROUP_HANDOFF_KEY);
    expect(() =>
      prepareGroupCheckout({
        ...transfer,
        packing: { ...transfer.packing, allocations: [] },
      }),
    ).toThrow(/Review each person/);
    expect(readLaunchCheckoutTransfer(true).picks).toEqual(transfer.picks);
    expect(session.getItem(CHECKOUT_BASKET_HANDOFF_KEY)).toBe(basket);
    expect(session.getItem(CHECKOUT_GROUP_HANDOFF_KEY)).toBe(group);
    expectPersonalUntouched();
  });

  test("blocked or full session storage retains the complete group during the current visit", () => {
    const transfer = buildGroupCheckout(planWithBags());
    session.failReads = session.failWrites = session.failRemoves = true;
    prepareGroupCheckout(transfer);
    expect(readLaunchCheckoutTransfer(true)).toEqual({
      picks: transfer.picks,
      group: { groupId: transfer.groupId, packing: transfer.packing, bags: transfer.bags },
      issue: null,
    });
    const ordinary = drink(1, mojito);
    prepareLaunchCheckout(ordinary, timed(ordinary));
    expect(readLaunchCheckoutPicks()).toEqual(ordinary);
    expect(readLaunchCheckoutGroup(ordinary)).toBeNull();
    expectPersonalUntouched();
  });
});

describe("a group restore is strict and all-or-nothing", () => {
  test("rejects missing, duplicate, over-allocated, unknown and mismatched bag metadata", () => {
    const transfer = buildGroupCheckout(planWithBags());
    const valid = metadata(transfer);
    const packing = valid.packing;
    const malformed: unknown[] = [
      { ...valid, version: 2 },
      { ...valid, paid: true },
      { ...valid, groupId: "invalid" },
      { ...valid, basket: encodeLaunchPicks(drink(2)) },
      { ...valid, bags: valid.bags.slice(0, 1) },
      { ...valid, bags: [...valid.bags].reverse() },
      {
        ...valid,
        bags: [
          { number: 1, label: "A" },
          { number: 1, label: "B" },
        ],
      },
      { ...valid, bags: [{ number: 1, label: "" }, valid.bags[1]] },
      { ...valid, packing: { ...packing, separateBags: false } },
      { ...valid, packing: { ...packing, bagCount: 1 } },
      { ...valid, packing: { ...packing, allocations: [] } },
      { ...valid, packing: { ...packing, allocations: packing.allocations.slice(0, 1) } },
      {
        ...valid,
        packing: {
          ...packing,
          allocations: [
            { lineId: "line-1", bag: 1, quantity: 1 },
            { lineId: "line-1", bag: 1, quantity: 1 },
            { lineId: "line-1", bag: 2, quantity: 1 },
          ],
        },
      },
      {
        ...valid,
        packing: {
          ...packing,
          allocations: [
            { lineId: "line-1", bag: 1, quantity: 2 },
            { lineId: "line-1", bag: 2, quantity: 2 },
          ],
        },
      },
      {
        ...valid,
        packing: { ...packing, allocations: [{ lineId: "line-1", bag: 1, quantity: 3 }] },
      },
      {
        ...valid,
        packing: { ...packing, allocations: [{ lineId: "line-2", bag: 1, quantity: 3 }] },
      },
      {
        ...valid,
        packing: {
          ...packing,
          allocations: [{ lineId: "line-1-extra-side", bag: 1, quantity: 3 }],
        },
      },
      {
        ...valid,
        packing: { ...packing, allocations: [{ lineId: "line-1", bag: 3, quantity: 3 }] },
      },
      {
        ...valid,
        packing: { ...packing, allocations: [{ lineId: "line-1", bag: 1, quantity: 0 }] },
      },
      {
        ...valid,
        packing: { ...packing, allocations: [{ lineId: "line-1", bag: 1, quantity: 21 }] },
      },
    ];
    expect(parseLaunchCheckoutGroup(JSON.stringify(valid), transfer.picks)).not.toBeNull();
    for (const bad of malformed) {
      const raw = JSON.stringify(bad);
      expect(parseLaunchCheckoutGroup(raw, transfer.picks)).toBeNull();
      seedColdTransfer(valid.basket, raw);
      const restored = readLaunchCheckoutTransfer(true);
      expect(restored.picks).toEqual([]);
      expect(restored.group).toBeNull();
      expect(restored.issue).toMatch(/complete group/);
      expect(session.getItem(CHECKOUT_GROUP_HANDOFF_KEY)).toBe(raw);
    }
    for (const raw of [null, "{", " ".repeat(120_001)])
      expect(parseLaunchCheckoutGroup(raw, transfer.picks)).toBeNull();
    expect(parseLaunchCheckoutGroup(JSON.stringify(valid), [])).toBeNull();
    expectPersonalUntouched();
  });

  test("a retired item in a saved group fails closed rather than dropping one person's food", () => {
    const transfer = buildGroupCheckout(planWithBags());
    const valid = metadata(transfer);
    const saved = JSON.parse(valid.basket) as {
      version: number;
      picks: Omit<LaunchMenuPick, "key">[];
    };
    saved.picks.push({
      brandId: "moktl",
      itemId: "moktl-retired-drink",
      quantity: 1,
      selections: {},
    });
    const staleBasket = JSON.stringify(saved);
    const staleMetadata = JSON.stringify({
      ...valid,
      basket: staleBasket,
      packing: {
        ...valid.packing,
        allocations: [...valid.packing.allocations, { lineId: "line-2", bag: 2, quantity: 1 }],
      },
    });
    seedColdTransfer(staleBasket, staleMetadata);
    const restored = readLaunchCheckoutTransfer();
    expect(restored.picks).toEqual([]);
    expect(restored.group).toBeNull();
    expect(restored.issue).toMatch(/complete group/);
    expect(readLaunchCheckoutPicks()).toEqual([]);
    expect(session.getItem(CHECKOUT_BASKET_HANDOFF_KEY)).toBe(staleBasket);
    expect(session.getItem(CHECKOUT_GROUP_HANDOFF_KEY)).toBe(staleMetadata);
    expectPersonalUntouched();
  });

  test("invalid prices, options, quantities and basket versions cannot restore a reduced group", () => {
    const valid = metadata();
    const saved = JSON.parse(valid.basket) as {
      version: number;
      picks: Omit<LaunchMenuPick, "key">[];
    };
    const pick = saved.picks[0]!;
    for (const basket of [
      { ...saved, version: 2 },
      { ...saved, picks: [{ ...pick, pricePence: 1 }] },
      { ...saved, picks: [{ ...pick, quantity: 21 }] },
      { ...saved, picks: [{ ...pick, selections: { "unknown-group": ["unknown-option"] } }] },
      { ...saved, picks: [] },
    ]) {
      const raw = JSON.stringify(basket);
      seedColdTransfer(raw, JSON.stringify({ ...valid, basket: raw }));
      expect(readLaunchCheckoutTransfer()).toEqual({
        picks: [],
        group: null,
        issue: expect.stringMatching(/complete group/),
      });
    }
    expectPersonalUntouched();
  });

  test("missing or lost group storage cannot silently open the unrelated personal basket", () => {
    const valid = metadata();
    for (const [basket, group] of [
      [valid.basket, null],
      [null, JSON.stringify(valid)],
      [null, null],
      ["{", JSON.stringify(valid)],
      [" ".repeat(100_001), JSON.stringify(valid)],
    ]) {
      seedColdTransfer(basket!, group!);
      const restored = readLaunchCheckoutTransfer(true);
      expect(restored.picks).toEqual([]);
      expect(restored.group).toBeNull();
      expect(restored.issue).toMatch(/complete group/);
    }
    clearLaunchCheckoutTransfer();
    session.failReads = true;
    expect(readLaunchCheckoutTransfer(true).issue).toMatch(/complete group/);
    expect(readLaunchCheckoutTransfer(true).picks).toEqual([]);
    expect(readLaunchCheckoutTransfer().picks).toEqual(personalPicks);
    expectPersonalUntouched();
  });
});

describe("group draft storage protects concurrent edits and reports persistence failures", () => {
  test("compares the last raw draft before saving or checkout and preserves another tab's changes", () => {
    const first = saveStoredGroupPlan(planWithBags(), null);
    expect(first.saved).toBe(true);
    expect(readStoredGroupPlan()).toEqual(first);
    expect(() => assertStoredGroupPlanCurrent(first.raw)).not.toThrow();
    const fromOtherTab = addGroupPerson(first.plan!, "Another tab", id(4));
    const otherRaw = encodeGroupPlan(fromOtherTab);
    local.setItem(GROUP_PLAN_STORAGE_KEY, otherRaw);
    const staleEdit = updateOrganiserPicks(first.plan!, drink(4, mojito));
    expect(() => saveStoredGroupPlan(staleEdit, first.raw)).toThrow(/changed in another tab/);
    expect(() => assertStoredGroupPlanCurrent(first.raw)).toThrow(/changed in another tab/);
    expect(local.getItem(GROUP_PLAN_STORAGE_KEY)).toBe(otherRaw);
    expect(readStoredGroupPlan().plan).toEqual(fromOtherTab);
    expectPersonalUntouched();
  });

  test("uses a clearly unsaved same-visit draft when browser storage is blocked", () => {
    const plan = planWithBags();
    local.failReads = local.failWrites = true;
    const result = saveStoredGroupPlan(plan, null);
    expect(result).toEqual({ plan, raw: null, saved: false, error: null });
    expect(readStoredGroupPlan()).toBe(result);
    expect(() => assertStoredGroupPlanCurrent(null)).not.toThrow();
    expect(local.values.has(GROUP_PLAN_STORAGE_KEY)).toBe(false);
    expectPersonalUntouched();
  });

  test("a full storage quota retains the old persisted draft and the current unsaved edits", () => {
    const first = saveStoredGroupPlan(planWithBags(), null);
    const changed = updateOrganiserPicks(first.plan!, drink(2, mojito));
    local.failWrites = true;
    const result = saveStoredGroupPlan(changed, first.raw);
    expect(result.saved).toBe(false);
    expect(result.raw).toBe(first.raw);
    expect(readStoredGroupPlan().plan).toEqual(changed);
    expect(local.getItem(GROUP_PLAN_STORAGE_KEY)).toBe(first.raw);
    local.failWrites = false;
    expect(saveStoredGroupPlan(changed, result.raw).saved).toBe(true);
    expect(readStoredGroupPlan().plan).toEqual(changed);
    expectPersonalUntouched();
  });

  test("reports a corrupt saved group without deleting it and requires explicit replacement", () => {
    local.setItem(GROUP_PLAN_STORAGE_KEY, "corrupt-json");
    const result = readStoredGroupPlan();
    expect(result.plan).toBeNull();
    expect(result.error).toMatch(/could not be read/);
    expect(local.getItem(GROUP_PLAN_STORAGE_KEY)).toBe("corrupt-json");
    expect(() => saveStoredGroupPlan(planWithBags(), result.raw)).toThrow(GroupPlanProblem);
    const replaced = saveStoredGroupPlan(planWithBags(), result.raw, true);
    expect(replaced.saved).toBe(true);
    expect(replaced.error).toBeNull();
    expect(readStoredGroupPlan().plan).toEqual(planWithBags());
    expectPersonalUntouched();
  });
});

describe("reply drafts are scoped to their invitation and restored strictly", () => {
  test("one group's reply cannot overwrite another invitation or the personal basket", () => {
    const first = freshInvite();
    const samePersonOtherGroup = { ...first, groupId: id(++invitationSequence) };
    const sameGroupOtherPerson = { ...first, inviteId: id(++invitationSequence) };
    expect(readGroupReplyDraft(first)).toBeNull();
    expect(saveGroupReplyDraft(first, drink(2), id(70)).saved).toBe(true);
    expect(saveGroupReplyDraft(samePersonOtherGroup, drink(1, mojito), id(71)).saved).toBe(true);
    expect(readGroupReplyDraft(first)).toEqual({
      picks: drink(2),
      responseId: id(70),
      saved: true,
    });
    expect(readGroupReplyDraft(samePersonOtherGroup)).toEqual({
      picks: drink(1, mojito),
      responseId: id(71),
      saved: true,
    });
    expect(readGroupReplyDraft(sameGroupOtherPerson)).toBeNull();
    expectPersonalUntouched();
  });

  test("unsaved reply choices remain available only within the matching current-visit invitation", () => {
    const invitation = freshInvite();
    local.failWrites = true;
    const draft = saveGroupReplyDraft(invitation, drink(2), id(70));
    expect(draft.saved).toBe(false);
    local.failReads = true;
    expect(readGroupReplyDraft(invitation)).toBe(draft);
    expect(readGroupReplyDraft(freshInvite())).toBeNull();
    expect(local.values.has(replyKey(invitation))).toBe(false);
    expectPersonalUntouched();
  });

  test("rejects corrupt response UUIDs, unsupported baskets and unknown options without partial restoration", () => {
    const encoded = encodeLaunchPicks(drink());
    const basket = JSON.parse(encoded) as { version: number; picks: Omit<LaunchMenuPick, "key">[] };
    const pick = basket.picks[0]!;
    for (const draft of [
      { responseId: "-".repeat(36), basket: encoded },
      { responseId: "not-a-uuid", basket: encoded },
      { responseId: id(70), basket: JSON.stringify({ ...basket, version: 2 }) },
      {
        responseId: id(70),
        basket: JSON.stringify({ ...basket, picks: [{ ...pick, itemId: "retired-drink" }] }),
      },
      {
        responseId: id(70),
        basket: JSON.stringify({
          ...basket,
          picks: [{ ...pick, selections: { "unknown-group": ["unknown-option"] } }],
        }),
      },
      {
        responseId: id(70),
        basket: JSON.stringify({ ...basket, picks: [{ ...pick, quantity: 21 }] }),
      },
      { responseId: id(70), basket: "null" },
      { responseId: id(70), basket: "{" },
    ]) {
      const invitation = freshInvite();
      const raw = JSON.stringify(draft);
      local.setItem(replyKey(invitation), raw);
      expect(readGroupReplyDraft(invitation)).toBeNull();
      expect(local.getItem(replyKey(invitation))).toBe(raw);
    }
    const tooLarge = freshInvite();
    local.setItem(replyKey(tooLarge), " ".repeat(100_001));
    expect(readGroupReplyDraft(tooLarge)).toBeNull();
    expectPersonalUntouched();
  });
});
