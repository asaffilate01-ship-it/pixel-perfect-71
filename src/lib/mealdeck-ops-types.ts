export type OpsLocation = { location_id: string; location_name: string };
export type OpsMenuItem = {
  item_id: string;
  brand_id: string | null;
  brand_name: string | null;
  category_name: string;
  item_name: string;
  description: string | null;
  price_pence: number;
  active: boolean;
  visible: boolean;
  location_price_pence: number;
  allergens: string[];
};
export type OpsTaxonomy = {
  category_id: string;
  category_name: string;
  brand_id: string;
  brand_name: string;
};
export type OpsOrder = {
  order_id: string;
  source: string | null;
  status: string;
  fulfilment: string;
  order_number?: string | null;
  created_at: string;
  paid_at: string | null;
  total_pence: number;
  item_count: number;
};
export type OpsOrderLine = {
  item_id: string;
  item_name: string;
  brand_name: string | null;
  quantity: number;
  unit_price_pence: number;
  modifiers: unknown;
  notes: string | null;
};
export type OpsIngredient = {
  ingredient_id: string;
  name: string;
  base_unit: "g" | "ml" | "each";
  allergens: string[];
  reorder_threshold: number;
  active: boolean;
};
export type OpsRecipeLine = {
  ingredientId: string;
  name: string;
  unit: string;
  quantity: number;
  wastePercent: number;
  allergens: string[];
};
export type OpsRecipe = {
  recipe_id: string;
  menu_item_id: string;
  item_name: string;
  brand_name: string | null;
  version: number;
  yield_units: number;
  prep_minutes: number;
  instructions: string;
  ingredients: OpsRecipeLine[];
  updated_at: string;
};
export type OpsStock = {
  ingredient_id: string;
  name: string;
  base_unit: string;
  quantity: number;
  reorder_threshold: number;
};
export type OpsCost = {
  ingredient_id: string;
  ingredient_name: string;
  base_unit: string;
  cost_per_unit_pence: number | null;
  effective_on: string | null;
  supplier: string | null;
};
export type OpsRecipeCost = {
  menu_item_id: string;
  menu_item_name: string;
  recipe_version: number;
  estimated_cost_pence: number | null;
  missing_ingredient_costs: number;
};
export type OpsExpense = {
  expense_id: string;
  occurred_on: string;
  category: string;
  amount_pence: number;
  note: string;
};
export type OpsFinance = {
  periodFrom: string;
  periodTo: string;
  recordedPaidGrossPence: number;
  recordedPaidOrders: number;
  pendingOrderCount: number;
  pendingOrderValuePence: number;
  settledHiveRefundsPence: number;
  recordedManualExpensesPence: number;
  unreconciled: boolean;
  vatCalculated: boolean;
  actualCogsCalculated: boolean;
  bankSettlementVerified: boolean;
};
export type OpsBrandSales = {
  brand_id: string | null;
  brand_name: string;
  item_count: number;
  order_count: number;
  recorded_goods_gross_pence: number;
};
export type OpsAnalytics = {
  periodFrom: string;
  periodTo: string;
  paidOrders: number;
  recordedPaidGrossPence: number;
  daily: { date: string; orders: number; grossPence: number }[];
  channels: { source: string; orders: number; grossPence: number }[];
};
export type OpsStaff = {
  access_id: string;
  user_id: string;
  user_email: string | null;
  location_id: string | null;
  role: string;
  enabled: boolean;
  grant_permissions: string[];
  deny_permissions: string[];
  created_at: string;
};
export type OpsAudit = {
  event_id: number;
  created_at: string;
  actor_id: string | null;
  location_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  previous_value: unknown;
  next_value: unknown;
};
