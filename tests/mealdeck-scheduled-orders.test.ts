import { describe, expect, test } from "bun:test";
import {
  MEALDECK_SCHEDULED_ORDERS_ENABLED,
  SCHEDULE_TIMEZONE,
  SCHEDULE_SLOT_MINUTES,
  mealdeckScheduledSlots,
  londonClockAt,
  londonSlotInstant,
  lutonScheduleDay,
  confirmScheduledOrderPayment,
  scheduledKdsTopNote,
} from "../src/lib/mealdeck-scheduled-orders";

const slots = (time: string, fulfilment: "pickup" | "curbside" | "delivery") =>
  mealdeckScheduledSlots({ serverNow: time, fulfilment });
const mondayAtOne = "2026-11-09T13:00:00Z";
const fridayAtOne = "2026-11-13T13:00:00Z";

describe("Scheduled MealDeck orders: 1pm UK opening and recurring Luton kitchen hours", () => {
  test("source cannot activate scheduling or bypass paid checkout", () => {
    expect(MEALDECK_SCHEDULED_ORDERS_ENABLED).toBe(false);
    expect(SCHEDULE_TIMEZONE).toBe("Europe/London");
    expect(SCHEDULE_SLOT_MINUTES).toBe(15);
    expect(slots("2026-11-09T12:59:59Z", "pickup")).toHaveLength(0);
    expect(slots(mondayAtOne, "pickup").length).toBeGreaterThan(0);
  });
  test("Mon–Thu 5pm open: pickup/kerbside 5:45pm, delivery 6:15pm", () => {
    expect(lutonScheduleDay("2026-11-09")?.kitchenOpensMinutes).toBe(17*60);
    expect(slots(mondayAtOne,"pickup")[0]?.time).toBe("17:45");
    expect(slots(mondayAtOne,"curbside")[0]?.time).toBe("17:45");
    expect(slots(mondayAtOne,"delivery")[0]?.time).toBe("18:15");
  });
  test("Fri–Sun 4pm open: pickup 4:45pm and delivery 5:15pm", () => {
    expect(lutonScheduleDay("2026-11-13")?.kitchenOpensMinutes).toBe(16*60);
    expect(slots(fridayAtOne,"pickup")[0]?.time).toBe("16:45");
    expect(slots(fridayAtOne,"delivery")[0]?.time).toBe("17:15");
    expect(slots("2026-11-15T13:00:00Z","pickup")[0]?.time).toBe("16:45");
  });
  test("cutoffs, quarter hours and prep deadlines remain exact", () => {
    for (const type of ["pickup","curbside","delivery"] as const) {
      const list = slots(mondayAtOne,type);
      expect(list.every(s=>s.time.endsWith("00")||s.time.endsWith("15")||s.time.endsWith("30")||s.time.endsWith("45"))).toBe(true);
      expect(list.at(-1)?.time).toBe(type==="delivery"?"22:15":"22:45");
      expect(list.every(s=>Date.parse(s.slotAt)-Date.parse(s.prepStartsAt)===s.preparationMinutes*60_000)).toBe(true);
    }
  });
  test("provider capture seconds matter; never accept 29m 1s instead of 30m", () => {
    const before = slots("2026-11-09T22:14:59Z","pickup");
    const after = slots("2026-11-09T22:15:01Z","pickup");
    expect(before.map(s=>s.time)).toEqual(["22:45"]);
    expect(after).toHaveLength(0);
    expect(slots("2026-11-09T21:14:59Z","delivery").at(-1)?.time).toBe("22:15");
    expect(slots("2026-11-09T21:15:01Z","delivery")).toHaveLength(0);
  });
  test("UTC summer conversion round-trips UK time and closed-day validation", () => {
    const summer="2027-06-11";
    const at=londonSlotInstant(summer, 16*60+45);
    expect(at).toBe("2027-06-11T15:45:00.000Z");
    expect(londonClockAt(at!)?.date).toBe(summer);
    expect(slots("2027-06-11T12:00:00Z","pickup")[0]?.time).toBe("16:45"); // 1pm BST
    expect(lutonScheduleDay("2026-02-30")).toBeNull();
    expect(lutonScheduleDay("2026-11-08")).toBeNull(); // policy starts Nov 9
  });
  test("future-date/invented timestamp cannot create a same-day slot", () => {
    expect(mealdeckScheduledSlots({serverNow:mondayAtOne,fulfilment:"delivery",serviceDate:"2026-11-10"})).toHaveLength(0);
    expect(slots("invalid","pickup")).toHaveLength(0);
  });
});

describe("Scheduled order confirmed ONLY after full provider-verified payment", () => {
  const selected = slots(mondayAtOne,"pickup")[0]!;
  const order = {
    serverNow: mondayAtOne,
    paymentConfirmedAt: mondayAtOne,
    paymentStatus: "paid" as const,
    canonicalTotalPence: 3000,
    capturedPence: 3000,
    refundedPence: 0,
    held: false,
    selectedSlotAt: selected.slotAt,
    fulfilment: "pickup" as const,
    source: "personal" as const,
  };
  test("full paid order has prep start and KDS note", () => {
    expect(confirmScheduledOrderPayment(order)).toEqual({
      status:"confirmed",slot:selected,releaseToKdsAt:selected.prepStartsAt,
    });
    expect(scheduledKdsTopNote(selected,false)).toBeNull();
    expect(scheduledKdsTopNote(selected,true)).toEqual({
      title:"SCHEDULED COLLECTION · 17:45 UK",
      detail:"PREP START 17:15 · ALLOW 30 MINUTES",
    });
  });
  test("group participant partial funding and pending Stripe payments never confirm", () => {
    expect(confirmScheduledOrderPayment({...order,source:"group",capturedPence:1200}).status).toBe("unconfirmed");
    expect(confirmScheduledOrderPayment({...order,paymentStatus:"partially_paid"}).status).toBe("unconfirmed");
    expect(confirmScheduledOrderPayment({...order,paymentConfirmedAt:null}).status).toBe("unconfirmed");
    expect(confirmScheduledOrderPayment({...order,held:true}).status).toBe("unconfirmed");
    expect(confirmScheduledOrderPayment({...order,refundedPence:100}).status).toBe("unconfirmed");
  });
  test("late payment produces a reviewable exception, not optimistic confirmation", () => {
    expect(confirmScheduledOrderPayment({...order,
      serverNow:"2026-11-09T17:16:00Z",
    })).toEqual({status:"unconfirmed",reason:"paid_slot_requires_operator_resolution"});
    expect(confirmScheduledOrderPayment({...order,
      paymentConfirmedAt:"2026-11-09T17:30:00Z",
      serverNow:"2026-11-09T17:30:00Z",
    })).toEqual({status:"unconfirmed",reason:"slot_no_longer_feasible_after_payment"});
  });
});
