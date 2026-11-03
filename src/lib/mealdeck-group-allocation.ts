/**
 * MealDeck Phase 19 — deterministic GBP-pence contribution PREVIEW.
 *
 * A plan is not a payment request or evidence of capture. For live orders,
 * Dishbee must independently price each item and delivery ON THE SERVER and
 * persist an immutable allocation before creating provider payment sessions.
 */
export type SplitReason =
  | "invalid_participants" | "invalid_amount" | "invalid_line" | "unallocated_items";
export type Contribution = {
  participantId: string;
  goodsPence: number;
  deliveryPence: number;
  duePence: number;
};
export type ContributionPlan =
  | { valid: true; goodsPence: number; deliveryPence: number; totalPence: number; shares: Contribution[] }
  | { valid: false; reason: SplitReason; shares: []; totalPence: 0 };
export type DeliveryPayer = "shared" | { participantId: string };
export type EqualSplitInput = {
  participantIds: readonly string[];
  goodsPence: number;
  deliveryPence: number;
  deliveryPayer: DeliveryPayer;
};
export type ItemAllocation = { participantId: string; quantity: number };
export type AssignedLine = {
  lineId: string;
  unitPricePence: number;
  quantity: number;
  allocations: readonly ItemAllocation[];
};
export type ItemisedSplitInput = {
  participantIds: readonly string[];
  lines: readonly AssignedLine[];
  deliveryPence: number;
  deliveryPayer: DeliveryPayer;
};

const MAX_PENCE = 10_000_000; // planning bound, never provider/checkout authority
const amount = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_PENCE;
const validId = (id: string) => /^[A-Za-z0-9_-]{1,80}$/.test(id);
const reject = (reason: SplitReason): ContributionPlan => ({
  valid: false, reason, shares: [], totalPence: 0,
});
function validParticipants(ids: readonly string[]): boolean {
  return ids.length >= 2 && ids.length <= 20 &&
    ids.every(validId) && new Set(ids).size === ids.length;
}
function validPayer(payer: DeliveryPayer, ids: readonly string[]): boolean {
  return payer === "shared" ||
    (typeof payer === "object" && payer !== null &&
      Object.keys(payer).length === 1 && ids.includes(payer.participantId));
}
function distribute(pence: number, count: number): number[] {
  const base = Math.floor(pence / count);
  const remainder = pence % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}
function finish(
  ids: readonly string[], goodsByPerson: readonly number[],
  goodsPence: number, deliveryPence: number, payer: DeliveryPayer,
): ContributionPlan {
  if (!amount(deliveryPence) || !amount(goodsPence) ||
    !amount(goodsPence + deliveryPence) || !validPayer(payer, ids) ||
    goodsByPerson.length !== ids.length ||
    goodsByPerson.some(value => !amount(value)) ||
    goodsByPerson.reduce((sum, value) => sum + value, 0) !== goodsPence) {
    return reject("invalid_amount");
  }
  const fees = payer === "shared"
    ? distribute(deliveryPence, ids.length)
    : ids.map(id => id === payer.participantId ? deliveryPence : 0);
  const shares = ids.map((participantId, i): Contribution => ({
    participantId,
    goodsPence: goodsByPerson[i]!,
    deliveryPence: fees[i]!,
    duePence: goodsByPerson[i]! + fees[i]!,
  }));
  if (shares.some(share => !amount(share.duePence)) ||
    shares.reduce((sum, share) => sum + share.duePence, 0) !== goodsPence + deliveryPence) {
    return reject("invalid_amount");
  }
  return { valid: true, goodsPence, deliveryPence, totalPence: goodsPence + deliveryPence, shares };
}

/** Exact pennies, including a deterministic 1p remainder; no ceil overcharge. */
export function planEqualGroupSplit(input: EqualSplitInput): ContributionPlan {
  if (!validParticipants(input.participantIds)) return reject("invalid_participants");
  if (!amount(input.goodsPence)) return reject("invalid_amount");
  return finish(input.participantIds, distribute(input.goodsPence, input.participantIds.length),
    input.goodsPence, input.deliveryPence, input.deliveryPayer);
}

/** A unit must be assigned exactly once; a multi-brand basket has ONE delivery fee. */
export function planItemisedGroupSplit(input: ItemisedSplitInput): ContributionPlan {
  const ids = input.participantIds;
  if (!validParticipants(ids)) return reject("invalid_participants");
  if (!input.lines.length || input.lines.length > 60) return reject("invalid_line");
  const lines = new Set<string>();
  const perPerson = new Map(ids.map(id => [id, 0]));
  let goodsPence = 0;
  for (const line of input.lines) {
    if (!validId(line.lineId) || lines.has(line.lineId) ||
      !amount(line.unitPricePence) ||
      !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 50 ||
      !Array.isArray(line.allocations) ||
      !line.allocations.length || line.allocations.length > ids.length) {
      return reject("invalid_line");
    }
    lines.add(line.lineId);
    const assigned = new Set<string>();
    let assignedCount = 0;
    for (const part of line.allocations) {
      if (!ids.includes(part.participantId) || assigned.has(part.participantId) ||
        !Number.isSafeInteger(part.quantity) || part.quantity <= 0 ||
        part.quantity > line.quantity) return reject("invalid_line");
      assigned.add(part.participantId);
      assignedCount += part.quantity;
      const updated = perPerson.get(part.participantId)! + line.unitPricePence * part.quantity;
      if (!amount(updated)) return reject("invalid_amount");
      perPerson.set(part.participantId, updated);
    }
    if (assignedCount !== line.quantity) return reject("unallocated_items");
    goodsPence += line.unitPricePence * line.quantity;
    if (!amount(goodsPence)) return reject("invalid_amount");
  }
  return finish(ids, ids.map(id => perPerson.get(id)!), goodsPence,
    input.deliveryPence, input.deliveryPayer);
}
