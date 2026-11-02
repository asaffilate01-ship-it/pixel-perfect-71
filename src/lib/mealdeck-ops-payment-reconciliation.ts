/**
 * Read-only supplier payment reconciliation suggestions.
 *
 * Payment records must be imported from an authenticated banking/payment source.
 * These helpers never change invoice status, post journal entries or release funds.
 * Only a server-authorized, audited accounting workflow can confirm settlement.
 */
export type SupplierPayable={
  invoiceId:string; supplierId:string; invoiceNumber:string;
  approvedGrossPence:number; approvedCreditPence:number;
  alreadyPaidPence:number; dueOn:string|null; status:"approved"|"paid"|"void"|"draft";
};
export type BankDebit={
  transactionId:string; bookedOn:string; amountPence:number;
  supplierId:string|null; reference:string;
  direction:"debit"|"credit"; reversed:boolean;
};
export type ReconciliationSuggestion={
  invoiceId:string; transactionId:string; outstandingPence:number;
  reason:"exact_reference"|"unique_supplier_amount";
  confidence:"high"|"review";
};
export type ReconciliationResult={
  suggestions:ReconciliationSuggestion[];
  unresolvedInvoices:string[]; unmatchedTransactions:string[];
  rejected:string[];
};

const integer=(value:number)=>Number.isSafeInteger(value)&&value>=0;
const normalized=(value:string)=>value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g,"");

export function reconcileSupplierPayments(
  invoices:readonly SupplierPayable[],transactions:readonly BankDebit[],
):ReconciliationResult{
  const rejected:string[]=[];
  const validInvoices=invoices.filter(i=>{
    const valid=!!i.invoiceId&&!!i.supplierId&&!!i.invoiceNumber&&
      integer(i.approvedGrossPence)&&integer(i.approvedCreditPence)&&integer(i.alreadyPaidPence)&&
      i.approvedCreditPence+i.alreadyPaidPence<=i.approvedGrossPence;
    if(!valid)rejected.push("invoice:"+i.invoiceId);
    return valid&&i.status==="approved";
  });
  const validTx=transactions.filter(t=>{
    const valid=!!t.transactionId&&integer(t.amountPence)&&t.amountPence>0&&
      !!t.bookedOn&&Number.isFinite(Date.parse(t.bookedOn))&&t.direction==="debit"&&!t.reversed;
    if(!valid)rejected.push("transaction:"+t.transactionId);
    return valid;
  });
  const outstanding=(i:SupplierPayable)=>i.approvedGrossPence-i.approvedCreditPence-i.alreadyPaidPence;
  // Block ambiguous/duplicated identities rather than assigning payments arbitrarily.
  const invoiceIds=new Set<string>(),duplicates=new Set<string>();
  for(const i of validInvoices){if(invoiceIds.has(i.invoiceId))duplicates.add(i.invoiceId);invoiceIds.add(i.invoiceId);}
  const txIds=new Set<string>(),duplicateTx=new Set<string>();
  for(const t of validTx){if(txIds.has(t.transactionId))duplicateTx.add(t.transactionId);txIds.add(t.transactionId);}
  const eligible=validInvoices.filter(i=>outstanding(i)>0&&!duplicates.has(i.invoiceId));
  const eligibleTx=validTx.filter(t=>!duplicateTx.has(t.transactionId));
  const options:{i:SupplierPayable;t:BankDebit;reason:ReconciliationSuggestion["reason"]}[]=[];
  for(const t of eligibleTx){
    for(const i of eligible){
      if(outstanding(i)!==t.amountPence||!t.supplierId||t.supplierId!==i.supplierId)continue;
      const ref=normalized(t.reference),number=normalized(i.invoiceNumber);
      const matches=number.length>=4&&ref.includes(number);
      options.push({i,t,reason:matches?"exact_reference":"unique_supplier_amount"});
    }
  }
  const byInvoice=new Map<string,number>(),byTx=new Map<string,number>();
  for(const o of options){byInvoice.set(o.i.invoiceId,(byInvoice.get(o.i.invoiceId)??0)+1);byTx.set(o.t.transactionId,(byTx.get(o.t.transactionId)??0)+1);}
  const suggestions:ReconciliationSuggestion[]=options.filter(o=>byInvoice.get(o.i.invoiceId)===1&&byTx.get(o.t.transactionId)===1).map(o=>({
    invoiceId:o.i.invoiceId,transactionId:o.t.transactionId,
    outstandingPence:outstanding(o.i),reason:o.reason,
    confidence:o.reason==="exact_reference"?"high":"review",
  }));
  const matchedInvoices=new Set(suggestions.map(s=>s.invoiceId));
  const matchedTx=new Set(suggestions.map(s=>s.transactionId));
  return{
    suggestions,
    unresolvedInvoices:eligible.filter(i=>!matchedInvoices.has(i.invoiceId)).map(i=>i.invoiceId),
    unmatchedTransactions:eligibleTx.filter(t=>!matchedTx.has(t.transactionId)).map(t=>t.transactionId),
    rejected:[...rejected,...[...duplicates].map(id=>"duplicate_invoice:"+id),...[...duplicateTx].map(id=>"duplicate_transaction:"+id)],
  };
}
