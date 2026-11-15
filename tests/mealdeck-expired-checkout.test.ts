import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  EXPIRED_CHECKOUT_LABEL,
  isExpiredUnpaidReceipt,
  opsCheckoutDisplayStatus,
  parseOpsCheckoutExpirations,
} from "../src/lib/mealdeck-expired-checkout";
import { customerOrderStatus } from "../src/lib/mealdeck-customer-orders";

const id = "c35e4485-e407-4c3b-a1bf-7abf2769a6a5";
const otherId = "10000000-0000-4000-8000-000000000001";
const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("expired unpaid checkout without fictional payment authority", () => {
  const receipt = {
    paymentSessionExpired: true,
    verifiedPaid: false,
    held: false,
    paidAt: null,
    paymentStatus: "payment_pending",
  };

  test("only private ledger expiry and missing payment permit the expired label", () => {
    expect(isExpiredUnpaidReceipt(receipt)).toBe(true);
    for (const changed of [
      { paymentSessionExpired: false },
      { verifiedPaid: true },
      { held: true },
      { paidAt: "2026-11-12T18:25:46Z" },
      { paymentStatus: "paid" },
      { paymentStatus: "refunded" },
      { paymentStatus: "partially_refunded" },
    ]) expect(isExpiredUnpaidReceipt({ ...receipt, ...changed })).toBe(false);
  });

  test("member order history distinguishes verified expiry from pending and paid", () => {
    const candidate = {
      orderId: id, handoffCode: null, verifiedPaid: false, held: false,
      paymentSessionExpired: true, fulfilment: "pickup" as const, totalPence: 999,
      createdAt: "2026-11-12T18:25:45Z", paidAt: null,
      acceptedAt: null, preparingAt: null, readyForCollectionAt: null, completedAt: null,
    };
    expect(customerOrderStatus(candidate)).toBe(EXPIRED_CHECKOUT_LABEL);
    expect(customerOrderStatus({ ...candidate, paymentSessionExpired: false })).toBe("Awaiting payment");
    expect(customerOrderStatus({ ...candidate, held: true })).toBe("Needs team review");
  });

  test("staff history does not infer expiration from age or other channels", () => {
    const pending = { source: "mealdeck", status: "payment_pending", paid_at: null };
    expect(opsCheckoutDisplayStatus(pending, true)).toBe(EXPIRED_CHECKOUT_LABEL);
    expect(opsCheckoutDisplayStatus(pending, false)).toBe("payment_pending");
    expect(opsCheckoutDisplayStatus({ ...pending, source: "ubereats" }, true)).toBe("payment_pending");
    expect(opsCheckoutDisplayStatus({ ...pending, paid_at: "2026-11-12T18:26:00Z" }, true))
      .toBe("payment_pending");
    expect(opsCheckoutDisplayStatus({ ...pending, status: "accepted" }, true)).toBe("accepted");
  });

  test("untrusted response cannot manufacture or duplicate expiry evidence", () => {
    expect([...parseOpsCheckoutExpirations([
      { order_id: id, payment_session_expired: true },
      { order_id: otherId, payment_session_expired: false },
    ], [id, otherId])!]).toEqual([id]);
    for (const response of [
      null,
      [{ order_id: id, payment_session_expired: "true" }],
      [{ order_id: id, payment_session_expired: true }, { order_id: id, payment_session_expired: true }],
      [{ order_id: otherId, payment_session_expired: true }],
      [{ order_id: id, payment_session_expired: true }, { order_id: otherId, payment_session_expired: true }],
    ]) expect(parseOpsCheckoutExpirations(response, [id])).toBeNull();
  });
});

describe("server KDS payment authority remains mandatory", () => {
  test("staff expiry projection is isolated, scoped and read-only", () => {
    const sql = read("deploy/mealdeck/post-install-migrations/20261115221500_mealdeck_expired_checkout_staff_projection.sql");
    expect(sql).toContain("profile='mealdeck-independent-v1'");
    expect(sql).toContain("mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.read')");
    expect(sql).toContain("o.tenant_id=p_tenant and o.location_id=p_location");
    expect(sql).toContain("o.id=any(p_orders)");
    for (const check of [
      "o.status='payment_pending'",
      "o.paid_at is null",
      "s.session_id is not null",
      "s.captured_pence=0",
      "s.verified_at is null",
      "s.expires_at<=now()",
    ]) expect(sql).toContain(check);
    expect(sql).toContain("to authenticated;");
    expect(sql).not.toMatch(/update public\.orders|insert into public\.kds_tickets|delete from public\.orders/i);
  });

  test("KDS release, accepted orders and ticket creation require verified full payment", () => {
    const stripe = read("deploy/mealdeck/post-install-migrations/20261105082900_mealdeck_stripe_checkout.sql");
    const kitchen = read("deploy/mealdeck/post-install-migrations/20261105090147_mealdeck_kitchen_printer.sql");
    for (const guard of [
      "s.verified_at is not null",
      "s.payment_intent_id=o.payment_reference",
      "s.captured_pence=o.total_pence",
      "s.refunded_pence=0",
      "s.void_reason is null",
      "o.payment_status='paid'",
      "o.paid_at is not null",
      "exists(select 1 from mealdeck_private.stripe_events e where e.order_id=o.id)",
    ]) expect(stripe).toContain(guard);
    expect(stripe).toContain("update public.orders set payment_status='paid'");
    expect(stripe).toContain("insert into public.kds_ticket_items");
    expect(kitchen).toContain("mealdeck_ops_private.kitchen_lock_order(p_tenant,p_location,p_order)");
    expect(kitchen).toContain("mealdeck_ops_private.kds_release_evidence(p_order)");
    expect(kitchen).toContain("mealdeck_kds_release_required");
  });

  test("expired customer receipt starts a NEW basket, never reuses old checkout order", () => {
    const ui = read("src/components/launch-checkout.tsx");
    expect(ui).toContain("isExpiredUnpaidReceipt(receipt)");
    expect(ui).toContain("This secure payment session expired without a confirmed payment.");
    expect(ui).toContain('to="/menus" className="md-checkout-primary"');
    expect(ui).toContain("If your bank shows a charge, contact MealDeck");
    expect(ui).not.toContain("Review your basket again");
  });
});
