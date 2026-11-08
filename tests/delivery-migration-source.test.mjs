import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../deploy/mealdeck/post-install-migrations/20261107230000_mealdeck_local_driver_delivery.sql",
    import.meta.url,
  ),
  "utf8",
);

test("own-driver migration is one atomic, guarded, valid dollar-quoted script", () => {
  assert.equal((sql.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1);
  assert.match(sql.trimEnd(), /commit;$/);
  const opens = (sql.match(/\bas \$\$/gi) ?? []).length;
  const closes = (sql.match(/\$\$;/g) ?? []).length;
  assert.ok(opens >= 8, "All function bodies retain their dollar-quoted SQL");
  assert.equal(opens, closes, "Every SQL function has one closing delimiter");
  assert.match(sql, /mealdeck_delivery_dedicated_backend_required/);
  assert.match(sql, /mealdeck-independent-v1/);
  assert.match(sql, /to_regnamespace\('dishbee_private'\) is not null/);
});

test("database enforces one real own-driver order, address privacy and full payment", () => {
  assert.match(sql, /alter table mealdeck_private\.local_driver_quotes enable row level security/);
  assert.match(sql, /alter table mealdeck_private\.local_driver_orders enable row level security/);
  assert.match(sql, /q\.total_pence<1500/);
  assert.match(sql, /distance_metres between 0 and 3000/);
  assert.match(sql, /mealdeck_local_driver_order_required/);
  assert.match(sql, /mealdeck_bind_local_delivery_quote/);
  assert.match(sql, /mealdeck_local_delivery_quote_for_actor/);
  assert.match(sql, /kds_release_evidence\(p_order\)/);
  assert.match(sql, /mealdeck_ops_private\.kds_assert_scope/);
  assert.match(sql, /driver_status='with_driver'/);
  assert.match(sql, /driver_status='delivered'/);
});

test("printer v0.2.3 address extension keeps private printer authority and receipt snapshots", () => {
  const addressSql = readFileSync(new URL(
    "../deploy/mealdeck/post-install-migrations/20261108074000_mealdeck_printer_delivery_address.sql",
    import.meta.url,
  ), "utf8");
  assert.equal((addressSql.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((addressSql.match(/^commit;$/gm) ?? []).length, 1);
  assert.match(addressSql, /mealdeck_delivery_printer_wrong_database/);
  assert.match(addressSql, /mealdeck_delivery_printer_owner_required/);
  assert.match(addressSql, /mealdeck_ops_private\.printer_assert_scope/);
  assert.match(addressSql, /public\.mealdeck_printer_claim_contact/);
  assert.match(addressSql, /mealdeck_private\.local_driver_orders/);
  assert.match(addressSql, /mealdeck_private\.local_driver_quotes/);
  assert.match(addressSql, /receiptContact|deliveryAddress/);
  assert.doesNotMatch(addressSql, /grant execute\s+on function public\./i);
  assert.doesNotMatch(addressSql, /update\s+mealdeck_private\.receipt_jobs/i);
});

test("existing printer, guest and member checkout projections include delivery", () => {
  assert.match(sql, /o\.fulfilment not in \('pickup','curbside','delivery'\)/);
  assert.match(sql, /x\.fulfilment in \('pickup','curbside','delivery'\)/);
  assert.match(sql, /receipt_snapshot_before_meal_components/);
  assert.match(sql, /'mealComponents',i->'mealComponents'/);
  assert.match(sql, /'paymentMethod','cash'/);
  assert.match(sql, /create or replace function public\.mealdeck_customer_order_receipt/i);
  assert.match(sql, /create or replace function public\.mealdeck_guest_order_receipt/i);
  assert.match(sql, /o\.paid_at\+interval '60 minutes'/);
  assert.match(sql, /handoff_status|handed_off/);
});
