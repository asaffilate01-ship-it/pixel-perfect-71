import {describe,expect,it} from "bun:test";
import {reconcileSupplierPayments,type SupplierPayable,type BankDebit} from "../src/lib/mealdeck-ops-payment-reconciliation";
const invoice=(changes:Partial<SupplierPayable>={}):SupplierPayable=>({
 invoiceId:"inv-1",supplierId:"supplier-1",invoiceNumber:"INV-2026-1042",
 approvedGrossPence:12000,approvedCreditPence:0,alreadyPaidPence:0,dueOn:"2026-11-30",status:"approved",...changes,
});
const debit=(changes:Partial<BankDebit>={}):BankDebit=>({
 transactionId:"bank-1",bookedOn:"2026-11-02",amountPence:12000,
 supplierId:"supplier-1",reference:"Invoice INV-2026-1042",direction:"debit",reversed:false,...changes,
});
describe("supplier payment matching",()=>{
 test("suggests an exact single supplier, amount and reference match",()=>{
  expect(reconcileSupplierPayments([invoice()],[debit()]).suggestions).toEqual([{
   invoiceId:"inv-1",transactionId:"bank-1",outstandingPence:12000,reason:"exact_reference",confidence:"high",
  }]);
 });
 test("accounts for verified credits and previous payments in the outstanding balance",()=>{
  expect(reconcileSupplierPayments([invoice({approvedCreditPence:1000,alreadyPaidPence:2000})],[debit({amountPence:9000})]).suggestions).toHaveLength(1);
 });
 test("does not suggest an ambiguous duplicate-value payment",()=>{
  const result=reconcileSupplierPayments([invoice(),invoice({invoiceId:"inv-2",invoiceNumber:"INV-2026-2042"})],[debit({reference:"supplier transfer"})]);
  expect(result.suggestions).toHaveLength(0);
  expect(result.unresolvedInvoices).toHaveLength(2);
 });
 test("excludes reversed, credit, unapproved and unverified-supplier transactions",()=>{
  expect(reconcileSupplierPayments([invoice()],[debit({reversed:true})]).suggestions).toHaveLength(0);
  expect(reconcileSupplierPayments([invoice()],[debit({direction:"credit"})]).suggestions).toHaveLength(0);
  expect(reconcileSupplierPayments([invoice({status:"draft"})],[debit()]).suggestions).toHaveLength(0);
  expect(reconcileSupplierPayments([invoice()],[debit({supplierId:null})]).suggestions).toHaveLength(0);
 });
 test("rejects invalid amounts and duplicated transaction identifiers",()=>{
  expect(reconcileSupplierPayments([invoice({approvedCreditPence:13000})],[debit()]).rejected).toContain("invoice:inv-1");
  const result=reconcileSupplierPayments([invoice()],[debit(),debit({amountPence:12000})]);
  expect(result.suggestions).toHaveLength(0);
  expect(result.rejected).toContain("duplicate_transaction:bank-1");
 });
 test("never matches transactions from the wrong supplier",()=>{
  expect(reconcileSupplierPayments([invoice()],[debit({supplierId:"supplier-2"})]).suggestions).toHaveLength(0);
 });
});
