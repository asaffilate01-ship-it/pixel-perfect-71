import {describe,expect,it} from "bun:test";
import {readFileSync} from "node:fs";
import {
  positiveBaseQuantity,poRemainingBaseUnits,quotedPoTotalPence,
  canApprovePurchase,canSubmitPurchase,batchExpiryState,expiryLabel,
} from "../src/lib/mealdeck-ops-procurement";

const sql=readFileSync(new URL(
  "../supabase/migrations/20261102202500_mealdeck_ops_procurement_batches.sql",
  import.meta.url,
),"utf8");

describe("MealDeck procurement validation",()=>{
  it("accepts measured base units to 0.001, refusing unsafe formats and zero",()=>{
    expect(positiveBaseQuantity("2.125")).toBe(2.125);
    expect(positiveBaseQuantity("1")).toBe(1);
    for(const invalid of ["0","-1","1.0009","4e3","10,000","", "10000001"]){
      expect(positiveBaseQuantity(invalid)).toBeNull();
    }
  });
  it("computes an individual ingredient's remaining base quantity, never combined units",()=>{
    const line={
      pack_count:3,base_units_per_pack:1000,received_base_units:1250,
      price_per_pack_pence:1500,
    };
    expect(poRemainingBaseUnits(line)).toBe(1750);
    expect(poRemainingBaseUnits({...line,received_base_units:4000})).toBeNull();
  });
  it("hides the total when pack prices are restricted or inconsistent",()=>{
    const a={pack_count:2,base_units_per_pack:1000,
      received_base_units:0,price_per_pack_pence:599};
    const b={pack_count:1,base_units_per_pack:500,
      received_base_units:0,price_per_pack_pence:125};
    expect(quotedPoTotalPence([a,b])).toBe(1323);
    expect(quotedPoTotalPence([{...a,price_per_pack_pence:null}])).toBeNull();
    expect(quotedPoTotalPence([])).toBeNull();
  });
  it("requires real submitted status and independent approval",()=>{
    expect(canSubmitPurchase("draft",true)).toBe(true);
    expect(canSubmitPurchase("draft",false)).toBe(false);
    expect(canSubmitPurchase("approved",true)).toBe(false);
    expect(canApprovePurchase("submitted",true,false)).toBe(true);
    expect(canApprovePurchase("submitted",true,true)).toBe(false);
    expect(canApprovePurchase("submitted",false,false)).toBe(false);
    expect(canApprovePurchase("received",true,false)).toBe(false);
  });
  it("distinguishes an expired use-by from a past best-before",()=>{
    expect(batchExpiryState("use_by","2026-11-01","2026-11-02")).toBe("expired");
    expect(batchExpiryState("use_by","2026-11-02","2026-11-02")).toBe("due_soon");
    expect(batchExpiryState("best_before","2026-12-01","2026-11-02")).toBe("ok");
    expect(batchExpiryState("none",null,"2026-11-02")).toBe("not_applicable");
    expect(batchExpiryState("use_by","2026-02-30","2026-11-02")).toBe("expired");
    expect(expiryLabel("expired","best_before")).toContain("quality");
    expect(expiryLabel("expired","use_by")).toContain("quarantine");
  });
});

describe("Procurement SQL safety contracts (not a Postgres execution test)",()=>{
  it("uses RLS and denies direct client CRUD on supplier, order and lot tables",()=>{
    for(const name of [
      "mealdeck_ops_suppliers","mealdeck_ops_purchase_orders",
      "mealdeck_ops_purchase_lines","mealdeck_ops_stock_batches",
      "mealdeck_ops_purchase_receipts","mealdeck_ops_batch_issues",
    ])expect(sql).toContain("'"+name+"'");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.%I from public,anon,authenticated");
    expect(sql).toContain("mealdeck_ops_private.can");
  });
  it("enforces kitchen, tenant, and independent finance approval at the database",()=>{
    const part=sql.split(
      "create or replace function public.mealdeck_ops_advance_purchase(",
    )[1]!.split("-- Receive a specific APPROVED PO line")[0];
    expect(part).toContain("v_order.created_by=(select auth.uid())");
    expect(part).toContain("mealdeck_ops_private.can(p_tenant,null,'finance.manage')");
    expect(part).toContain("v_order.status<>'submitted'");
    expect(part).toContain("for update");
    expect(part).toContain("'purchase.'||p_action");
    expect(sql).toContain("and o.location_id=p_location");
  });
  it("records a delivered receipt and a positive stock movement in one DB transaction",()=>{
    const begin=sql.indexOf("create or replace function public.mealdeck_ops_receive_purchase(");
    const end=sql.indexOf("create or replace function public.mealdeck_ops_batch_list(",begin);
    const block=sql.slice(begin,end);
    expect(block).toContain("unique(purchase_line_id,delivery_reference)");
    expect(block).toContain("where rec.purchase_line_id=p_line");
    expect(block).toContain("mealdeck_ops_receipt_idempotency_mismatch");
    expect(block).toContain("v_order.status not in ('approved','partially_received')");
    expect(block).toContain("p_base_qty >");
    expect(block).toContain("mealdeck_ops_stock_movements");
    expect(block).toContain("'purchase'");
    expect(block).toContain("purchase.receive");
    expect(block.indexOf("return v_existing.id;")).toBeLessThan(
      block.indexOf("mealdeck_ops_purchase_not_receivable"),
    );
  });
  it("refuses duplicate lot issue and expired use-by production",()=>{
    expect(sql).toContain("unique(tenant_id,location_id,issue_reference)");
    expect(sql).toContain("mealdeck_ops_issue_idempotency_mismatch");
    expect(sql).toContain("mealdeck_ops_batch_insufficient_stock");
    expect(sql).toContain("mealdeck_ops_cannot_use_expired_batch");
    expect(sql).toContain("set issued_base_units=b.issued_base_units+p_quantity");
    expect(sql).toContain("p_quantity,-p_quantity");
  });
  it("restricts kitchen staff from reading supplier emails or purchasing prices",()=>{
    expect(sql).toContain("then s.contact_email::text else null::text");
    expect(sql).toContain("then l.price_per_pack_pence else null::integer");
    expect(sql).toContain("then coalesce(sum(l.pack_count::bigint*l.price_per_pack_pence),0)");
    expect(sql).toContain("count(l.id) filter(where l.received_base_units>=");
  });
  it("does not contact suppliers, charge cards, mark orders paid, or release KDS",()=>{
    expect(sql).not.toContain("release_order_to_kds(");
    expect(sql).not.toContain("confirm_order_payment(");
    expect(sql).not.toContain("update public.orders");
    expect(sql).not.toContain("update public.hive_payment_sessions");
    expect(sql).not.toContain("http_post(");
  });
});
