import {describe,expect,it} from "bun:test";
import {readFileSync} from "node:fs";
import {
  isInvoiceSubmittable,poPriceVariancePence,
  canApproveSupplierInvoice,canApproveSupplierCredit,
  availableSupplierCredit,TAX_CATEGORIES,
} from "../src/lib/mealdeck-ops-invoices";

const sql=readFileSync(new URL(
  "../supabase/migrations/20261102214500_mealdeck_ops_invoice_matching.sql",
  import.meta.url,
),"utf8");

describe("Supplier invoice math and approval UI guard",()=>{
  it("requires an exact line-to-header reconciliation before submission",()=>{
    expect(isInvoiceSubmittable({
      declaredNetPence:10000,declaredVatPence:2000,
      lines:[{net_pence:4000,vat_pence:800},{net_pence:6000,vat_pence:1200}],
    })).toBe(true);
    expect(isInvoiceSubmittable({
      declaredNetPence:10000,declaredVatPence:2000,
      lines:[{net_pence:9000,vat_pence:2000}],
    })).toBe(false);
    expect(isInvoiceSubmittable({
      declaredNetPence:10000,declaredVatPence:2000,lines:[],
    })).toBe(false);
    expect(isInvoiceSubmittable({
      declaredNetPence:-10,declaredVatPence:0,lines:[{net_pence:10,vat_pence:0}],
    })).toBe(false);
  });
  it("flags significant supplier price changes against PO unit price",()=>{
    const exact=poPriceVariancePence(1000,1000,500,500);
    expect(exact?.expectedPence).toBe(500);
    expect(exact?.withinTolerance).toBe(true);
    const rounding=poPriceVariancePence(1000,1000,500,505);
    expect(rounding?.withinTolerance).toBe(true);
    const over=poPriceVariancePence(1000,1000,500,520);
    expect(over?.withinTolerance).toBe(false);
    expect(poPriceVariancePence(1000,0,500,500)).toBeNull();
  });
  it("requires reviewed tax evidence, global finance permission and another approver",()=>{
    expect(canApproveSupplierInvoice("matched",true,true,"creator","reviewer")).toBe(true);
    expect(canApproveSupplierInvoice("matched",true,true,"creator","creator")).toBe(false);
    expect(canApproveSupplierInvoice("matched",false,true,"creator","reviewer")).toBe(false);
    expect(canApproveSupplierInvoice("submitted",true,true,"creator","reviewer")).toBe(false);
    expect(canApproveSupplierInvoice("matched",true,false,"creator","reviewer")).toBe(false);
    expect(canApproveSupplierCredit("submitted",true,"creator","reviewer")).toBe(true);
    expect(canApproveSupplierCredit("submitted",true,"creator","creator")).toBe(false);
    expect(canApproveSupplierCredit("draft",true,"creator","reviewer")).toBe(false);
  });
  it("caps supplier credits independently by net and VAT, rejecting corrupt claims",()=>{
    expect(availableSupplierCredit({
      invoiceNetPence:1000,invoiceVatPence:200,
      approvedCredits:[{net_pence:300,vat_pence:60}],
    })).toEqual({remainingNetPence:700,remainingVatPence:140});
    expect(availableSupplierCredit({
      invoiceNetPence:1000,invoiceVatPence:200,
      approvedCredits:[{net_pence:1001,vat_pence:0}],
    })).toBeNull();
    expect(availableSupplierCredit({
      invoiceNetPence:1000,invoiceVatPence:200,
      approvedCredits:[{net_pence:0,vat_pence:250}],
    })).toBeNull();
    expect(TAX_CATEGORIES).toContain("out_of_scope");
  });
});

describe("Phase 9 supplier invoice schema source contract",()=>{
  it("requires RLS and denies direct table writes on all 3 business records",()=>{
    for(const table of [
      "mealdeck_ops_supplier_invoices",
      "mealdeck_ops_supplier_invoice_lines",
      "mealdeck_ops_supplier_credits",
    ]){
      expect(sql).toContain("'"+table+"'");
    }
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.%I from public,anon,authenticated");
    expect(sql).toContain("mealdeck_ops_private.can");
  });
  it("requires tenant/location/supplier identity and duplicate invoice numbers prevented",()=>{
    expect(sql).toContain("unique(tenant_id,supplier_id,invoice_number_key)");
    expect(sql).toContain("unique(tenant_id,supplier_id,credit_number_key)");
    expect(sql).toContain("mealdeck_ops_private.can(p_tenant,p_location,'finance.manage')");
    expect(sql).toContain("foreign key(tenant_id,location_id,purchase_line_id)");
    expect(sql).toContain("foreign key(tenant_id,location_id,invoice_id)");
  });
  it("requires real physical receiving and ensures another matched invoice cannot double claim goods",()=>{
    const start=sql.indexOf("create or replace function public.mealdeck_ops_invoice_action(");
    const end=sql.indexOf("-- Manual tax-document evidence review",start);
    const functionSql=sql.slice(start,end);
    expect(functionSql).toContain("for update");
    expect(functionSql).toContain("v_row.base_quantity>v_row.received_base_units");
    expect(functionSql).toContain("other_invoice.status in ('matched','approved')");
    expect(functionSql).toContain("mealdeck_ops_invoice_goods_already_claimed");
    expect(functionSql).toContain("mealdeck_ops_invoice_price_variance");
    expect(functionSql).toContain("mealdeck_ops_invoice_totals_mismatch");
  });
  it("separates supplier tax evidence from actual VAT filing",()=>{
    expect(sql).toContain("mealdeck_ops_review_invoice_tax");
    expect(sql).toContain("mealdeck_ops_invoice_tax_category_missing");
    expect(sql).toContain("v_inv.tax_document_reviewed");
    expect(sql).toContain("mealdeck_ops_invoice_second_approver_required");
    expect(sql).toContain("'vatReturnVerified',false");
    expect(sql).toContain("'bankPaymentVerified',false");
    expect(sql).toContain("'accountingPosted',false");
  });
  it("serialises supplier credits and forbids net/VAT over-credit or self-approval",()=>{
    expect(sql).toContain("mealdeck_ops_credit_exceeds_invoice");
    expect(sql).toContain("v_credit.created_by=(select auth.uid())");
    expect(sql).toContain("mealdeck_ops_credit_second_approver_required");
    expect(sql).toContain("v_inv.status<>'approved'");
    expect(sql).toContain("v_credit.net_pence+v_credited_net>v_inv.declared_net_pence");
  });
  it("never changes merchant payments, triggers purchases or releases KDS",()=>{
    for(const forbidden of [
      "update public.orders","release_order_to_kds(",
      "confirm_order_payment(","adyen_balance_account_ref",
      "http_post(","send_supplier_email(",
    ])expect(sql).not.toContain(forbidden);
  });
});
