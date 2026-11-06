import { describe, expect, test } from "bun:test";
import {
  receiveRoomChoices,
  roomBagBill,
  roomPersonStatus,
} from "../src/components/group-order-room-state";
import type { GroupOrderRoom } from "../src/lib/mealdeck-group-rooms";
import type { SharedPaymentRoom } from "../src/lib/mealdeck-shared-payments";

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
function room(): GroupOrderRoom {
  return {
    schemaVersion: 1,
    roomId: id(1),
    revision: 3,
    phase: "collecting",
    paymentMode: "separate",
    joinDeadline: "2026-11-06T15:03:00Z",
    serverNow: "2026-11-06T15:01:00Z",
    createdAt: "2026-11-06T15:00:00Z",
    invitationsClosed: false,
    fulfilment: "pickup",
    cutleryRequested: false,
    viewer: { participantId: id(2), role: "organiser" },
    pendingCount: 1,
    joinedCount: 1,
    readyCount: 0,
    canFinalize: false,
    orderId: null,
    paymentRoomId: null,
    people: [
      {
        participantId: id(2),
        name: "Sam",
        isOrganiser: true,
        state: "joined",
        version: 2,
        bagNumber: null,
        shareId: null,
        picks: [
          { brandId: "skorch-burgers", itemId: "classic-smash", quantity: 1, selections: {} },
        ],
      },
      {
        participantId: id(3),
        name: "Alex",
        isOrganiser: false,
        state: "invited",
        version: 1,
        bagNumber: null,
        shareId: null,
      },
    ],
  };
}

describe("room polling preserves the person's choices", () => {
  test("an invitation expiring cannot erase unsaved food edits", () => {
    const initial = room();
    const clean = receiveRoomChoices(null, initial);
    const local = { ...clean, dirty: true, picks: [{ ...clean.picks[0]!, quantity: 2 }] };
    const next = room();
    next.revision += 1;
    next.pendingCount = 0;
    next.people[1]!.state = "expired";
    const received = receiveRoomChoices(local, next);
    expect(received).toBe(local);
    expect(received.picks[0]!.quantity).toBe(2);
    expect(received.dirty).toBe(true);
    expect(received.conflict).toBe(false);
  });

  test("a newer own edit in another tab is flagged without silently adopting it", () => {
    const initial = room();
    const clean = receiveRoomChoices(null, initial);
    const local = { ...clean, dirty: true, picks: [{ ...clean.picks[0]!, quantity: 2 }] };
    const next = room();
    next.people[0]!.version += 1;
    next.people[0]!.picks![0]!.quantity = 3;
    const received = receiveRoomChoices(local, next);
    expect(received.conflict).toBe(true);
    expect(received.version).toBe(2);
    expect(received.picks[0]!.quantity).toBe(2);
    expect(received.dirty).toBe(true);
  });

  test("freezing from another tab retains unsaved edits until explicit discard", () => {
    const clean = receiveRoomChoices(null, room());
    const local = { ...clean, dirty: true, picks: [{ ...clean.picks[0]!, quantity: 2 }] };
    const frozen = room();
    frozen.phase = "payment";
    frozen.people[0]!.version += 2;
    frozen.people[0]!.state = "ready";
    const conflict = receiveRoomChoices(local, frozen);
    expect(conflict.picks[0]!.quantity).toBe(2);
    expect(conflict.conflict).toBe(true);
    const discarded = receiveRoomChoices(null, frozen);
    expect(discarded.picks[0]!.quantity).toBe(1);
    expect(discarded.dirty).toBe(false);
  });

  test("an acknowledged save clears dirty state and adopts the returned version", () => {
    const clean = receiveRoomChoices(null, room());
    const local = { ...clean, dirty: true, picks: [{ ...clean.picks[0]!, quantity: 2 }] };
    const saved = room();
    saved.people[0]!.version += 1;
    saved.people[0]!.picks![0]!.quantity = 2;
    const received = receiveRoomChoices(local, saved, true);
    expect(received.version).toBe(3);
    expect(received.picks[0]!.quantity).toBe(2);
    expect(received.dirty).toBe(false);
    expect(received.conflict).toBe(false);
  });

  test("a response with an older person version cannot replace an acknowledged save", () => {
    const saved = room();
    saved.people[0]!.version = 7;
    saved.people[0]!.picks![0]!.quantity = 4;
    const clean = receiveRoomChoices(null, saved);
    expect(receiveRoomChoices(clean, room())).toBe(clean);
  });

  test("a different room or participant never inherits someone else's local food", () => {
    const clean = receiveRoomChoices(null, room());
    const local = { ...clean, dirty: true };
    const next = room();
    next.roomId = id(20);
    next.people[0]!.picks = [];
    const received = receiveRoomChoices(local, next);
    expect(received.roomId).toBe(id(20));
    expect(received.picks).toEqual([]);
    expect(received.dirty).toBe(false);
  });
});

function payment(): SharedPaymentRoom {
  return {
    schemaVersion: 1,
    roomId: id(1),
    orderId: id(9),
    handoffCode: null,
    splitMode: "by_bag",
    status: "awaiting_payment",
    currency: "gbp",
    totalPence: 700,
    paidPence: 0,
    remainingPence: 700,
    expiresAt: "2026-11-06T15:20:00Z",
    viewer: { role: "organiser", shareId: id(4) },
    canPay: true,
    canCancel: true,
    message: "Waiting for payments.",
    shares: [
      { shareId: id(4), bagNumber: 1, amountPence: 233, paidPence: 0, status: "unpaid" },
      { shareId: id(5), bagNumber: 2, amountPence: 467, paidPence: 0, status: "unpaid" },
    ],
    lines: [
      {
        lineId: "line-1",
        name: "Shared configured item",
        quantity: 3,
        linePence: 1000,
        description: "All reviewed flavour and extras",
      },
    ],
    bags: [
      { number: 1, name: "Sam", allocations: [{ lineId: "line-1", quantity: 1 }] },
      { number: 2, name: "Alex", allocations: [{ lineId: "line-1", quantity: 2 }] },
    ],
    cutleryRequested: false,
    fulfilment: "pickup",
  };
}

describe("itemised bills use the canonical food and payment allocation", () => {
  test("all item pennies and discounts reconcile to the exact final shares", () => {
    const value = payment();
    const first = roomBagBill(value, 1)!;
    const second = roomBagBill(value, 2)!;
    expect(first.grossPence).toBe(333);
    expect(second.grossPence).toBe(667);
    expect(first.discountPence! + second.discountPence!).toBe(300);
    expect(first.totalPence + second.totalPence).toBe(700);
    expect(first.lines[0]!.description).toBe("All reviewed flavour and extras");
    expect(first.lines[0]!.quantity).toBe(1);
    expect(second.lines[0]!.quantity).toBe(2);
  });

  test("a restricted participant bill keeps the authoritative share and does not invent a partial line price", () => {
    const value = payment();
    value.viewer = { role: "participant", shareId: id(4) };
    value.bags = [value.bags[0]!];
    value.shares = [value.shares[0]!];
    const bill = roomBagBill(value, 1)!;
    expect(bill.totalPence).toBe(233);
    expect(bill.grossPence).toBeNull();
    expect(bill.discountPence).toBeNull();
    expect(bill.lines[0]!.allocatedPence).toBeNull();
    expect(bill.lines[0]!.quantity).toBe(1);
  });

  test("organising without a food bag does not borrow another person's bill", () => {
    expect(roomBagBill(payment(), 3)).toBeNull();
  });

  test("roster distinguishes payment confirmation, ready food, and an organiser without food", () => {
    const person = room().people[0]!;
    expect(
      roomPersonStatus(
        { ...person, state: "ready", bagNumber: 1, paymentState: "processing" },
        "payment",
      ),
    ).toBe("Confirming payment");
    expect(
      roomPersonStatus(
        { ...person, state: "ready", bagNumber: 1, paymentState: "paid" },
        "payment",
      ),
    ).toBe("Paid");
    expect(roomPersonStatus({ ...person, state: "ready", bagNumber: 1 }, "payment")).toBe(
      "Ready to pay",
    );
    expect(roomPersonStatus({ ...person, state: "ready", bagNumber: null }, "payment")).toBe(
      "Organising only",
    );
  });
});
