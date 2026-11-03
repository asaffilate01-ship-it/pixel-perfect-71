import { describe, expect, test } from "bun:test";
import {
  planEqualGroupSplit, planItemisedGroupSplit,
} from "../src/lib/mealdeck-group-allocation";

const ids = ["host", "guest2", "guest3"];
describe("Phase 19: exact-penny multi-brand split previews", () => {
  test("equal split never rounds up everyone's share", () => {
    const plan = planEqualGroupSplit({
      participantIds: ids, goodsPence: 1001, deliveryPence: 0, deliveryPayer: "shared",
    });
    expect(plan.valid).toBe(true);
    if (plan.valid) expect(plan.shares.map(s => s.duePence)).toEqual([334, 334, 333]);
  });
  test("one delivery fee is split only once across all brands", () => {
    const plan = planEqualGroupSplit({
      participantIds: ids, goodsPence: 1001, deliveryPence: 299, deliveryPayer: "shared",
    });
    expect(plan.valid).toBe(true);
    if (plan.valid) {
      expect(plan.shares.map(s => s.deliveryPence)).toEqual([100, 100, 99]);
      expect(plan.shares.reduce((sum, s) => sum + s.duePence, 0)).toBe(1300);
    }
  });
  test("one host can cover the full delivery once", () => {
    const plan = planEqualGroupSplit({
      participantIds: ids, goodsPence: 1001, deliveryPence: 299,
      deliveryPayer: { participantId: "guest2" },
    });
    expect(plan.valid).toBe(true);
    if (plan.valid) {
      expect(plan.shares.map(s => s.duePence)).toEqual([334, 633, 333]);
    }
  });
  test("rejects unknown delivery payer, duplicate people and overflow", () => {
    expect(planEqualGroupSplit({
      participantIds: ids, goodsPence: 100, deliveryPence: 20,
      deliveryPayer: { participantId: "stranger" },
    }).valid).toBe(false);
    expect(planEqualGroupSplit({
      participantIds: ["host", "host"], goodsPence: 100, deliveryPence: 0, deliveryPayer: "shared",
    }).valid).toBe(false);
    expect(planEqualGroupSplit({
      participantIds: ids, goodsPence: 10_000_000, deliveryPence: 1, deliveryPayer: "shared",
    }).valid).toBe(false);
  });
  test("itemised assignment pays only for allocated dishes, not one fee per brand", () => {
    const plan = planItemisedGroupSplit({
      participantIds: ids, deliveryPence: 300, deliveryPayer: { participantId: "host" },
      lines: [
        { lineId: "skorch_burger", unitPricePence: 999, quantity: 2,
          allocations: [{ participantId: "host", quantity: 1 }, { participantId: "guest2", quantity: 1 }] },
        { lineId: "moktl_drink", unitPricePence: 499, quantity: 1,
          allocations: [{ participantId: "guest3", quantity: 1 }] },
      ],
    });
    expect(plan.valid).toBe(true);
    if (plan.valid) {
      expect(plan.shares.map(s => s.duePence)).toEqual([1299, 999, 499]);
      expect(plan.totalPence).toBe(2797);
    }
  });
  test("unallocated, duplicated, or stranger assignments fail closed", () => {
    const base = {
      participantIds: ids, deliveryPence: 0, deliveryPayer: "shared" as const,
      lines: [{ lineId: "burger", unitPricePence: 1200, quantity: 2,
        allocations: [{ participantId: "host", quantity: 1 }] }],
    };
    expect(planItemisedGroupSplit(base).valid).toBe(false);
    expect(planItemisedGroupSplit({ ...base, lines: [
      { ...base.lines[0]!, allocations: [
        { participantId: "host", quantity: 1 }, { participantId: "host", quantity: 1 },
      ] },
    ] }).valid).toBe(false);
    expect(planItemisedGroupSplit({ ...base, lines: [
      { ...base.lines[0]!, allocations: [{ participantId: "stranger", quantity: 2 }] },
    ] }).valid).toBe(false);
  });
});
