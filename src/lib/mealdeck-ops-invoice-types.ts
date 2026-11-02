import type {InvoiceStatus,CreditStatus,TaxCategory} from "./mealdeck-ops-invoices";
export type OpsSupplierInvoice={
  invoice_id:string;supplier_name:string;invoice_number:string;
  invoice_date:string;due_date:string|null;status:InvoiceStatus;
  declared_net_pence:number;declared_vat_pence:number;
  declared_gross_pence:number;tax_document_reviewed:boolean;
  purchase_order_id:string;created_by:string;approved_at:string|null;
  line_count:number;
};
export type OpsSupplierInvoiceLine={
  line_id:string;purchase_line_id:string;ingredient_name:string;
  base_unit:string;base_quantity:number;po_received_quantity:number;
  net_pence:number;vat_pence:number;tax_category:TaxCategory;
  po_quoted_net_pence:number;
};
export type OpsSupplierCredit={
  credit_id:string;invoice_id:string;credit_number:string;issued_on:string;
  reason:string;net_pence:number;vat_pence:number;gross_pence:number;
  status:CreditStatus;created_by:string;
};
export type OpsSupplierInvoiceSummary={
  approvedInvoiceCount:number;approvedSupplierNetPence:number;
  supplierVatDeclaredPence:number;unmatchedInvoiceCount:number;
  approvedCreditNetPence:number;approvedCreditVatPence:number;
  bankPaymentVerified:boolean;vatReturnVerified:boolean;
  accountingPosted:boolean;periodFrom:string;periodTo:string;
};
