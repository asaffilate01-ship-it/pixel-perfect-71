export type OpsSupplier={
  supplier_id:string;name:string;contact_email:string|null;
  lead_time_days:number;status:"active"|"paused";
};
export type OpsPurchase={
  order_id:string;supplier_name:string;
  status:"draft"|"submitted"|"approved"|"partially_received"|"received"|"cancelled";
  created_at:string;approved_at:string|null;
  ordered_units:number;received_units:number;
  quoted_total_pence:number|null;note:string;created_by:string;
};
export type OpsPurchaseLine={
  line_id:string;ingredient_id:string;ingredient_name:string;base_unit:string;
  pack_count:number;base_units_per_pack:number;received_base_units:number;
  price_per_pack_pence:number|null;
};
export type OpsBatch={
  batch_id:string;ingredient_id:string;ingredient_name:string;unit:string;
  supplier_name:string;batch_code:string;
  expiry_kind:"use_by"|"best_before"|"none";
  expiry_on:string|null;received_base_units:number;issued_base_units:number;
  tracked_balance:number;
  expiry_state:"expired"|"due_soon"|"ok"|"not_applicable";
};
