import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { id } from "./harness.mjs";

export const guestTokenHash = (value) => createHash("sha256").update(value).digest("hex");

/** Disposable database clock only. No request/config switch exists in production.
 * The real schedule is exercised separately; relative quote TTLs stay independent
 * of the date on which CI runs, including after the November launch has ended.
 */
export async function setGuestFixtureClock(db, value) {
  assert.match(value, /^2026-11-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  await db.exec(`
    create or replace function mealdeck_private.launch_window()
    returns jsonb language sql stable security definer set search_path='' as $$
      select w || jsonb_build_object('serverNow',now(),'currentClosesAt',
        case when w->>'currentClosesAt' is not null then
          now()+((w->>'currentClosesAt')::timestamptz-timestamptz '${value}')
        else null end)
      from (select mealdeck_private.launch_window_at(timestamptz '${value}') w) clock
    $$;
  `);
}

export function guestFixtureMethods(db, f) {
  let attempt = 17000;
  const serviceRpc = async (name, values) => {
    assert.match(
      name,
      /^mealdeck_(?:begin_guest_session|resolve_guest_session|end_guest_session|create_guest_checkout_quote|prepare_guest_stripe_order|guest_order_receipt)$/,
    );
    return f.service(
      async () =>
        (
          await db.query(
            `select public.${name}(${values.map((_, index) => "$" + (index + 1)).join(",")}) as result`,
            values,
          )
        ).rows[0].result,
    );
  };
  const session = (token, overrides = {}) =>
    serviceRpc("mealdeck_begin_guest_session", [
      overrides.tenantId ?? f.tenantId,
      overrides.locationId ?? f.locationId,
      token,
      overrides.name ?? "Guest Customer",
      overrides.email ?? "guest@example.invalid",
      overrides.phone ?? "+447700900199",
    ]);
  const resolve = (token, overrides = {}) =>
    serviceRpc("mealdeck_resolve_guest_session", [
      overrides.tenantId ?? f.tenantId,
      overrides.locationId ?? f.locationId,
      token,
    ]);
  const end = (token) =>
    serviceRpc("mealdeck_end_guest_session", [f.tenantId, f.locationId, token]);
  const quote = (token, overrides = {}) => {
    const lines = overrides.lines ?? [f.line];
    return serviceRpc("mealdeck_create_guest_checkout_quote", [
      overrides.tenantId ?? f.tenantId,
      overrides.locationId ?? f.locationId,
      token,
      overrides.fulfilment ?? "pickup",
      overrides.vehicle ? JSON.stringify(overrides.vehicle) : null,
      JSON.stringify(lines),
      overrides.hash ?? "c".repeat(64),
      JSON.stringify(overrides.packing ?? f.pack(lines)),
    ]);
  };
  const prepare = (token, quoteId, options = {}) =>
    serviceRpc("mealdeck_prepare_guest_stripe_order", [
      options.tenantId ?? f.tenantId,
      options.locationId ?? f.locationId,
      token,
      quoteId,
      options.attemptId ?? id(++attempt),
      options.account ?? "acct_Fixture",
      options.livemode ?? false,
    ]);
  const receipt = (token, orderId, overrides = {}) =>
    serviceRpc("mealdeck_guest_order_receipt", [
      overrides.tenantId ?? f.tenantId,
      overrides.locationId ?? f.locationId,
      token,
      orderId,
    ]);
  return { session, resolve, end, quote, prepare, receipt };
}
