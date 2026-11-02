export type InvoiceStatus="draft"|"submitted"|"matched"|"approved"|"void";
export type CreditStatus="draft"|"submitted"|"approved"|"void";
export type TaxCategory="unreviewed"|"zero"|"reduced"|"standard"|"exempt"|"out_of_scope";
export const TAX_CATEGORIES:readonly TaxCategory[]=[
  "unreviewed","zero","reduced","standard","exempt","out_of_scope",
];
export function isInvoiceSubmittable(input:{
  declaredNetPence:number;declaredVatPence:number;
  lines:readonly {net_pence:number;vat_pence:number}[];
}):boolean{
  if(!Number.isSafeInteger(input.declaredNetPence)||input.declaredNetPence<=0||
     !Number.isSafeInteger(input.declaredVatPence)||input.declaredVatPence<0||
     input.lines.length===0)return false;
  let net=0,vat=0;
  for(const line of input.lines){
    if(!Number.isSafeInteger(line.net_pence)||line.net_pence<0||
       !Number.isSafeInteger(line.vat_pence)||line.vat_pence<0)return false;
    net+=line.net_pence;vat+=line.vat_pence;
  }
  return Number.isSafeInteger(net)&&Number.isSafeInteger(vat)&&
    net===input.declaredNetPence&&vat===input.declaredVatPence;
}
export function poPriceVariancePence(
  baseQuantity:number,baseUnitsPerPack:number,packPricePence:number,
  supplierNetPence:number,
):{expectedPence:number;differencePence:number;withinTolerance:boolean}|null{
  if(!Number.isFinite(baseQuantity)||baseQuantity<=0||
     !Number.isFinite(baseUnitsPerPack)||baseUnitsPerPack<=0||
     !Number.isSafeInteger(packPricePence)||packPricePence<0||
     !Number.isSafeInteger(supplierNetPence)||supplierNetPence<0)return null;
  const expected=Math.round(baseQuantity*packPricePence/baseUnitsPerPack);
  if(!Number.isSafeInteger(expected))return null;
  const difference=Math.abs(supplierNetPence-expected);
  return{expectedPence:expected,differencePence:difference,
    withinTolerance:difference<=Math.max(1,Math.ceil(expected*.01))};
}
export function canApproveSupplierInvoice(
  status:InvoiceStatus,taxDocumentReviewed:boolean,
  globalFinanceManage:boolean,createdBy:string,reviewerId:string,
):boolean{
  return status==="matched"&&taxDocumentReviewed&&globalFinanceManage&&
    !!reviewerId&&createdBy!==reviewerId;
}
export function canApproveSupplierCredit(
  status:CreditStatus,globalFinanceManage:boolean,
  createdBy:string,reviewerId:string,
):boolean{
  return status==="submitted"&&globalFinanceManage&&!!reviewerId&&
    createdBy!==reviewerId;
}
export function availableSupplierCredit(input:{
  invoiceNetPence:number;invoiceVatPence:number;
  approvedCredits:readonly {net_pence:number;vat_pence:number}[];
}):{remainingNetPence:number;remainingVatPence:number}|null{
  const{invoiceNetPence,invoiceVatPence,approvedCredits}=input;
  if(![invoiceNetPence,invoiceVatPence].every(x=>Number.isSafeInteger(x)&&x>=0))return null;
  let usedNet=0,usedVat=0;
  for(const item of approvedCredits){
    if(!Number.isSafeInteger(item.net_pence)||item.net_pence<0||
       !Number.isSafeInteger(item.vat_pence)||item.vat_pence<0)return null;
    usedNet+=item.net_pence;usedVat+=item.vat_pence;
  }
  if(!Number.isSafeInteger(usedNet)||!Number.isSafeInteger(usedVat)||
      usedNet>invoiceNetPence||usedVat>invoiceVatPence)return null;
  return{remainingNetPence:invoiceNetPence-usedNet,
    remainingVatPence:invoiceVatPence-usedVat};
}
