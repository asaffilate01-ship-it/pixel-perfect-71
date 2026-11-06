import type { GroupOrderPerson, GroupOrderRoom } from "@/lib/mealdeck-group-rooms";
import type { LaunchMenuPick } from "@/lib/launch-menu-picks";
import type { SharedPaymentRoom } from "@/lib/mealdeck-shared-payments";

export type RoomChoicesDraft = {
  roomId: string;
  participantId: string;
  version: number;
  picks: LaunchMenuPick[];
  dirty: boolean;
  conflict: boolean;
};

export function roomPersonPicks(person: GroupOrderPerson): LaunchMenuPick[] {
  return (person.picks ?? []).map(({ crossSelections, ...pick }, index) => ({
    ...pick,
    ...(crossSelections ? { crossSelections } : {}),
    key: `${person.participantId}:${index}:${pick.brandId}:${pick.itemId}`,
  }));
}

/** A background update never discards unsaved choices, even if another tab changed them. */
export function receiveRoomChoices(
  current: RoomChoicesDraft | null,
  room: GroupOrderRoom,
  saved = false,
): RoomChoicesDraft {
  const own = room.people.find((person) => person.participantId === room.viewer.participantId)!;
  const same = current?.roomId === room.roomId && current.participantId === own.participantId;
  if (same && own.version < current.version) return current;
  if (same && current.dirty && !saved) {
    return own.version > current.version ? { ...current, conflict: true } : current;
  }
  return {
    roomId: room.roomId,
    participantId: own.participantId,
    version: own.version,
    picks: roomPersonPicks(own),
    dirty: false,
    conflict: false,
  };
}

export function roomPersonStatus(person: GroupOrderPerson, phase: GroupOrderRoom["phase"]): string {
  if (person.paymentState === "paid") return "Paid";
  if (person.paymentState === "processing") return "Confirming payment";
  if (person.paymentState === "refund_review") return "Payment under review";
  if (person.paymentState === "cancelled") return "Payment closed";
  if (phase === "payment" && person.state === "ready")
    return person.bagNumber === null ? "Organising only" : "Ready to pay";
  const labels: Record<GroupOrderPerson["state"], string> = {
    invited: "Invited",
    joined: "Choosing",
    ready: "Ready",
    left: "Left the room",
    expired: "Didn’t join in time",
    removed: "Removed",
  };
  return labels[person.state];
}

/** Allocate only the canonical server line amount, conserving every penny across bags. */
export function roomBagBill(payment: SharedPaymentRoom, bagNumber: number) {
  const bag = payment.bags.find((entry) => entry.number === bagNumber);
  const share = payment.shares.find((entry) => entry.bagNumber === bagNumber);
  if (!bag || !share) return null;
  const lines = bag.allocations.flatMap((allocation) => {
    const line = payment.lines.find((entry) => entry.lineId === allocation.lineId);
    if (!line) return [];
    const pieces = payment.bags.flatMap((entry) =>
      entry.allocations
        .filter((part) => part.lineId === line.lineId)
        .map((part) => ({ bagNumber: entry.number, quantity: part.quantity })),
    );
    const totalQuantity = pieces.reduce((sum, part) => sum + part.quantity, 0);
    // A participant response may contain only their own complete bag. Do not invent
    // a whole-line charge if some of a canonical line belongs to another bag.
    if (totalQuantity !== line.quantity) {
      return [{ ...line, quantity: allocation.quantity, allocatedPence: null }];
    }
    const amounts = pieces
      .map((part) => ({
        ...part,
        amount: Math.floor((line.linePence * part.quantity) / line.quantity),
        remainder: (line.linePence * part.quantity) % line.quantity,
      }))
      .sort((a, b) => b.remainder - a.remainder || a.bagNumber - b.bagNumber);
    let pennies = line.linePence - amounts.reduce((sum, part) => sum + part.amount, 0);
    for (const part of amounts) {
      if (pennies <= 0) break;
      part.amount += 1;
      pennies -= 1;
    }
    return [
      {
        ...line,
        quantity: allocation.quantity,
        allocatedPence: amounts.find((part) => part.bagNumber === bagNumber)?.amount ?? null,
      },
    ];
  });
  const complete = lines.every((line) => line.allocatedPence !== null);
  const grossPence = complete
    ? lines.reduce((sum, line) => sum + (line.allocatedPence ?? 0), 0)
    : null;
  return {
    lines,
    share,
    grossPence,
    discountPence:
      grossPence !== null && grossPence >= share.amountPence
        ? grossPence - share.amountPence
        : null,
    totalPence: share.amountPence,
  };
}
