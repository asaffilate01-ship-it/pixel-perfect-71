import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { stripeSessionParameters, type PreparedStripeOrder } from "../src/lib/mealdeck-stripe.server";
import { checkoutPayInput, checkoutQuoteInput } from "../src/lib/mealdeck-checkout-selection";

const source=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const order:PreparedStripeOrder={
 orderId:"00000000-0000-4000-8000-000000000001",
 quoteId:"00000000-0000-4000-8000-000000000002",
 grossPence:1999,discountPence:999,totalPence:1000,staffVoucherApplied:true,
 currency:"gbp",email:null,fulfilment:"pickup",sessionId:null,sessionUrl:null,
 expiresAt:"2026-12-07T12:00:00Z",lines:[{name:"Fixture meal",quantity:1,line_pence:1999}],
 requestHash:"a".repeat(64),
};
describe("Secure staff voucher transport and checkout price",()=>{
 test("charges the frozen net amount once, not a second Stripe coupon",()=>{
   const params=stripeSessionParameters(order);
   expect(params.get("line_items[0][price_data][unit_amount]")).toBe("1000");
   expect(params.get("line_items[0][price_data][product_data][description]")).toContain("Staff voucher: 50% discount");
   expect([...params.keys()].some(key=>/coupon|promotion_code|discounts\[/.test(key))).toBe(false);
 });
 test("unmarked discounts do not invent a staff promotion",()=>{
   const params=stripeSessionParameters({...order,staffVoucherApplied:false});
   expect(params.get("line_items[0][price_data][product_data][description]")).not.toContain("Staff voucher");
 });
 test("ordinary quote and pay schemas do not accept client-controlled discount amounts or voucher fields",()=>{
   const pay={action:"pay",quoteId:order.quoteId,attemptId:order.orderId,reviewConfirmed:true};
   expect(checkoutPayInput.safeParse(pay).success).toBe(true);
   expect(checkoutPayInput.safeParse({...pay,discountPence:1000}).success).toBe(false);
   expect(checkoutPayInput.safeParse({...pay,staffVoucherCode:"synthetic"}).success).toBe(false);
   const quote={action:"quote",fulfilment:"pickup",picks:[{brandId:"skorch-burgers",itemId:"the-ace",quantity:1,selections:{}}],packing:{cutleryRequested:false,separateBags:false,bagCount:1,allocations:[]}};
   expect(checkoutQuoteInput.safeParse(quote).success).toBe(true);
   expect(checkoutQuoteInput.safeParse({...quote,staffVoucherCode:"synthetic"}).success).toBe(false);
 });
 test("server owns the voucher hash, scope, display marker and readiness",()=>{
   const server=source("src/lib/mealdeck-online-checkout.server.ts");
   expect(server).toContain('status.staffVoucherEligible !== true');
   expect(server).toContain('createHash("sha256").update(code).digest("hex")');
   expect(server).toContain('p_code_hash: voucherHash');
   expect(server).toContain('selectionInput = { ...rest, action: "quote" }');
   expect(server).toContain('quote["staffVoucherApplied"] !== true');
   expect(server).toContain('ownDriverShortfallPence(quote["totalPence"] as number)');
   const ui=source("src/components/launch-checkout.tsx");
   expect(ui).toContain('type="password" autoComplete="off"');
   expect(ui).toContain("Apply 50% voucher");
   expect(ui).toContain('quote.staffVoucherApplied === true');
   expect(ui).not.toMatch(/(?:localStorage|sessionStorage)\.setItem\([^\n]*staffVoucherCode/);
   expect(source(".env.example")).toContain("MEALDECK_STAFF_VOUCHERS_ENABLED=false");
 });
 test("database installation and ordinary order materialization fail closed",()=>{
   const sql=source("deploy/mealdeck/operations/20261127_staff_vouchers.sql");
   expect(sql).toContain("enabled boolean not null default false");
   expect(sql).toContain("code_hash text not null unique");
   expect(sql).toContain("unique(issued_by,issue_request_id)");
   expect(sql).toContain("'alreadyIssued',true");
   expect(sql).toContain("consumed_quote_id uuid unique");
   expect(sql).toContain("where id=link.voucher_id for update");
   expect(sql).toContain("or p_room is not null");
   expect(sql).toContain("or v.consumed_at is not null");
   expect(sql).toContain("md5(prosrc)='d170220fc74064fa3c575f55347e16bb'");
   expect(sql).toContain("revoke all on mealdeck_private.staff_voucher_settings");
 });
});


test("a rejected voucher does not erase the previous reviewed quote or confirm payment",()=>{
 const ui=source("src/components/launch-checkout.tsx");
 const review=ui.slice(ui.indexOf("  async function reviewTotal("),ui.indexOf("  async function pay("));
 const reset=review.match(/if \(voucherCode\) \{[\s\S]*?\n    \}/)?.[0];
 expect(reset).toBeDefined();
 expect(reset).toContain('setStaffVoucherCode("")');
 expect(reset).toContain("setReviewConfirmed(false)");
 expect(reset).not.toContain("setQuote(null)");
 expect(reset).not.toContain("attempt.current = null");
 expect(review).toContain("if (!result.quote) throw new Error");
 expect(review.indexOf('result.quote.staffVoucherApplied !== true')).toBeLessThan(review.indexOf("setQuote(result.quote)"));
 expect(review.indexOf("setQuote(result.quote)")).toBeLessThan(review.indexOf("attempt.current = { quoteId: result.quote.quoteId"));
});
