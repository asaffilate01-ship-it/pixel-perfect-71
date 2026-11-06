import { setupOrderNotesFixture } from "./order-notes-fixture.mjs";
import { buildOrderNotesSql } from "../../deploy/mealdeck/order-notes.mjs";

export async function setupStaffCashOrdersFixture(db) {
  const f = await setupOrderNotesFixture(db);
  await db.exec(buildOrderNotesSql());
  const cashQuote = async (options = {}) => {
    const lines = options.lines ?? [f.line];
    return f.service(() =>
      f.scalar(
        "select public.mealdeck_create_cash_quote($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)",
        [
          options.actor ?? f.owner,
          options.tenantId ?? f.tenantId,
          options.locationId ?? f.locationId,
          JSON.stringify(lines),
          JSON.stringify(options.packing ?? f.pack(lines)),
          options.hash ?? "c".repeat(64),
          options.name === undefined ? "Amna O’Neill" : options.name,
          options.phone === undefined ? "+447700900123" : options.phone,
          options.notes ?? null,
        ],
      ),
    );
  };
  const cashArgs = (quote, attempt, options = {}) => [
    options.actor ?? f.owner,
    options.tenantId ?? f.tenantId,
    options.locationId ?? f.locationId,
    typeof quote === "string" ? quote : quote.quoteId,
    attempt,
  ];
  const cashConfirm = (quote, attempt, options = {}) =>
    f.service(() =>
      f.scalar("select public.mealdeck_confirm_cash_order($1,$2,$3,$4,$5,$6)", [
        ...cashArgs(quote, attempt, options),
        options.received ?? true,
      ]),
    );
  const cashStatus = (quote, attempt, options = {}) =>
    f.service(() =>
      f.scalar(
        "select public.mealdeck_cash_order_status($1,$2,$3,$4,$5)",
        cashArgs(quote, attempt, options),
      ),
    );
  const cashCancel = (quote, attempt, options = {}) =>
    f.service(() =>
      f.scalar(
        "select public.mealdeck_cancel_cash_order_attempt($1,$2,$3,$4,$5)",
        cashArgs(quote, attempt, options),
      ),
    );
  return { ...f, cashQuote, cashArgs, cashConfirm, cashStatus, cashCancel };
}
