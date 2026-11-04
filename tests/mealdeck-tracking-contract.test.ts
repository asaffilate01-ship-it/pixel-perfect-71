import { describe, expect, test } from "bun:test";
import { parseMealDeckTrackingReply } from "../src/lib/mealdeck-tracking-contract";
import { presentMealDeckTracking } from "../src/lib/mealdeck-tracking-presentation";
import { safeCourierTrackingUrl } from "../src/lib/mealdeck-tracking-links";

const row = (patch: Record<string, unknown> = {}) => ({
  order_status: "ready",
  fulfilment: "delivery",
  pass_status: "sealed",
  delivery_status: "booked",
  created_at: "2026-11-04T12:00:00+00:00",
  updated_at: "2026-11-04T12:05:00+00:00",
  ...patch,
});

describe("MealDeck read-only tracking RPC projection contract", () => {
  test("copies only explicit projection fields and never returns private or unrelated RPC fields", () => {
    expect(
      parseMealDeckTrackingReply([
        row({
          tracking_url: "https://tracking.example.test/fixture",
          customer_email: "PRIVATE@example.invalid",
          customer_name: "PRIVATE CUSTOMER",
          delivery_address: { street: "PRIVATE ADDRESS" },
          handoff_code: "1234",
          payment_reference: "PRIVATE PAYMENT",
          tenant_id: "PRIVATE TENANT",
          observedAt: "2099-01-01T00:00:00Z",
        }),
      ]),
    ).toEqual({
      kind: "found",
      row: {
        orderStatus: "ready",
        fulfilment: "delivery",
        passStatus: "sealed",
        deliveryStatus: "booked",
        createdAt: "2026-11-04T12:00:00+00:00",
        updatedAt: "2026-11-04T12:05:00+00:00",
        trackingUrlCandidate: "https://tracking.example.test/fixture",
      },
    });
  });

  test("accepts a legacy reply without inventing placement time from its latest update", () => {
    expect(
      parseMealDeckTrackingReply([
        {
          order_status: "payment_pending",
          fulfilment: "pickup",
          updated_at: "2026-11-04T12:05:00Z",
          pass_status: null,
          delivery_status: null,
        },
      ]),
    ).toEqual({
      kind: "found",
      row: {
        orderStatus: "payment_pending",
        fulfilment: "pickup",
        updatedAt: "2026-11-04T12:05:00Z",
      },
    });
    expect(parseMealDeckTrackingReply([])).toEqual({ kind: "not_found" });
  });

  test("rejects ambiguous envelopes, non-record rows and records with inherited authority fields", () => {
    for (const value of [
      null,
      undefined,
      {},
      row(),
      [row(), row()],
      [null],
      [false],
      [1],
      ["paid"],
      [[row()]],
      [Object.create(row())],
      [Object.assign(new Date(), row())],
    ])
      expect(parseMealDeckTrackingReply(value)).toEqual({ kind: "invalid" });
    expect(parseMealDeckTrackingReply([Object.assign(Object.create(null), row())]).kind).toBe(
      "found",
    );
  });

  test("rejects the array-to-status coercion that previously produced false delivered progress", () => {
    expect(
      parseMealDeckTrackingReply([
        {
          order_status: ["paid"],
          fulfilment: ["delivery"],
          pass_status: ["sealed"],
          delivery_status: ["delivered"],
        },
      ]),
    ).toEqual({ kind: "invalid" });
  });

  test("requires bounded literal normalized order and fulfilment codes without string coercion", () => {
    for (const field of ["order_status", "fulfilment"]) {
      for (const value of [
        undefined,
        null,
        false,
        1,
        ["paid"],
        {},
        "",
        "PAID",
        "paid ",
        " paid",
        "paid\n",
        "a".repeat(61),
        "<script>",
        "paid.status",
      ])
        expect(parseMealDeckTrackingReply([row({ [field]: value })])).toEqual({ kind: "invalid" });
    }
  });

  test("malformed optional statuses invalidate the reply; only null or absent values are omitted", () => {
    for (const field of ["pass_status", "delivery_status"]) {
      for (const value of [
        [],
        ["sealed"],
        0,
        false,
        {},
        "",
        "SEALED",
        "sealed\n",
        "a".repeat(61),
      ]) {
        expect(parseMealDeckTrackingReply([row({ [field]: value })])).toEqual({ kind: "invalid" });
      }
    }
    expect(
      parseMealDeckTrackingReply([row({ pass_status: null, delivery_status: undefined })]),
    ).toEqual({
      kind: "found",
      row: {
        orderStatus: "ready",
        fulfilment: "delivery",
        createdAt: "2026-11-04T12:00:00+00:00",
        updatedAt: "2026-11-04T12:05:00+00:00",
      },
    });
  });

  test("omits non-string or oversized timestamps and leaves calendar validation to the presentation clock", () => {
    const omitted = parseMealDeckTrackingReply([
      row({ created_at: ["2026-11-04T12:00:00Z"], updated_at: 123 }),
    ]);
    expect(omitted).toEqual({
      kind: "found",
      row: {
        orderStatus: "ready",
        fulfilment: "delivery",
        passStatus: "sealed",
        deliveryStatus: "booked",
      },
    });
    const oversized = parseMealDeckTrackingReply([
      row({ created_at: "x".repeat(41), updated_at: new Date() }),
    ]);
    expect(oversized).toEqual(omitted);
    const invalidCalendar = parseMealDeckTrackingReply([
      row({ created_at: "2026-02-30T12:00:00Z", updated_at: "not-a-time" }),
    ]);
    if (invalidCalendar.kind !== "found")
      throw new Error("Expected a structurally valid projection row");
    const presented = presentMealDeckTracking({
      ...invalidCalendar.row,
      observedAt: "2026-11-04T12:10:00Z",
    });
    expect(presented.createdAtIso).toBeNull();
    expect(presented.updatedAtIso).toBeNull();
  });

  test("a parsed tracking URL is only a candidate and still needs the server's trusted-host allowlist", () => {
    const parsed = parseMealDeckTrackingReply([
      row({ tracking_url: "https://tracking.example.test/fixture" }),
    ]);
    if (parsed.kind !== "found") throw new Error("Expected a valid projection row");
    expect(safeCourierTrackingUrl(parsed.row.trackingUrlCandidate, undefined)).toBeNull();
    expect(
      safeCourierTrackingUrl(parsed.row.trackingUrlCandidate, "other.example.test"),
    ).toBeNull();
    expect(safeCourierTrackingUrl(parsed.row.trackingUrlCandidate, "tracking.example.test")).toBe(
      "https://tracking.example.test/fixture",
    );
    for (const tracking_url of [
      ["https://tracking.example.test/fixture"],
      1,
      {},
      "x".repeat(2049),
    ]) {
      const candidate = parseMealDeckTrackingReply([row({ tracking_url })]);
      expect(candidate.kind).toBe("found");
      if (candidate.kind === "found") expect(candidate.row.trackingUrlCandidate).toBeUndefined();
    }
  });

  test("structurally valid unknown codes are not lifecycle or payment authority", () => {
    const parsed = parseMealDeckTrackingReply([row({ order_status: "future_order_state" })]);
    if (parsed.kind !== "found") throw new Error("Expected a structurally valid projection row");
    const presented = presentMealDeckTracking(parsed.row);
    expect(presented.tone).toBe("review");
    expect(presented.paymentRecorded).toBe(false);
    expect(presented.canOpenCourierTracking).toBe(false);
  });
});
