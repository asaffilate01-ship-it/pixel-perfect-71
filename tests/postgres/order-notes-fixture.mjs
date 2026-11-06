import { readFile } from "node:fs/promises";
import { setupPaidOrderNumbersFixture } from "./paid-order-numbers-fixture.mjs";
import { setGuestFixtureClock } from "./guest-checkout-fixture.mjs";
import { buildPaidOrderNumbersSql } from "../../deploy/mealdeck/paid-order-numbers.mjs";
import { buildPublicMenuSql } from "../../deploy/mealdeck/public-menu.mjs";
import { buildPublicMenuReadSql } from "../../deploy/mealdeck/public-menu-read.mjs";
import { buildIncludedDrinkStockSql } from "../../deploy/mealdeck/included-drink-stock.mjs";

export async function setupOrderNotesFixture(db) {
  await db.exec('create schema extensions; create extension "uuid-ossp" with schema extensions');
  const f = await setupPaidOrderNumbersFixture(db);
  await db.exec(buildPaidOrderNumbersSql());
  await db.exec(buildPublicMenuSql());
  await db.exec(buildPublicMenuReadSql());
  await db.exec(buildIncludedDrinkStockSql());
  // Exact installed member quote wrapper. Its private verification call remains
  // in the entry path; no notes RPC may bypass it to call the actor helper.
  await db.exec(
    await readFile(new URL("./live-verification-installed-fixture.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("./order-notes-installed-quote-fixture.sql", import.meta.url), "utf8"),
  );
  await setGuestFixtureClock(db, "2026-11-06T16:00:00Z");
  const notesQuote = async (notes, options = {}) => {
    const lines = options.lines ?? [f.line];
    const args = [
      options.tenantId ?? f.tenantId,
      options.locationId ?? f.locationId,
      options.token ?? options.customer ?? f.customer,
      options.fulfilment ?? "pickup",
      options.vehicle ? JSON.stringify(options.vehicle) : null,
      JSON.stringify(lines),
      options.hash ?? "d".repeat(64),
      JSON.stringify(options.packing ?? f.pack(lines)),
      notes,
    ];
    const name = options.token
      ? "mealdeck_create_guest_checkout_quote_with_notes"
      : "mealdeck_create_checkout_quote_with_notes";
    return f.service(() =>
      f.scalar(`select public.${name}($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9)`, args),
    );
  };
  return { ...f, notesQuote };
}
