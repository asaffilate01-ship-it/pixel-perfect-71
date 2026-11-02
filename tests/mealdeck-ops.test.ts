import {describe,expect,it} from "bun:test";
import {readFileSync} from "node:fs";
import {
  effectiveOpsPermissions,OPS_ROLE_PERMISSIONS,OPS_PERMISSIONS,
} from "../src/lib/mealdeck-ops-access";
import {
  poundsToPence,penceToPounds,packCostPerBaseUnit,
  estimatedRecipeMargin,cleanDailySeries,
} from "../src/lib/mealdeck-ops-math";
import type {OpsAccess} from "../src/lib/mealdeck-ops-browser";

const tenantA="00000000-0000-4000-8000-000000000101";
const tenantB="00000000-0000-4000-8000-000000000102";
const kitchenA="00000000-0000-4000-8000-000000000201";
const kitchenB="00000000-0000-4000-8000-000000000202";
const staff=(role:OpsAccess["role"],tenant=tenantA,location:string|null=kitchenA,
  grants:string[]=[],denies:string[]=[]):OpsAccess=>({
    access_id:"fixture",tenant_id:tenant,tenant_name:"MealDeck test",
    location_id:location,role,grant_permissions:grants,deny_permissions:denies,
  });
const core=readFileSync(new URL(
  "../supabase/migrations/20261102191000_mealdeck_ops_core.sql",import.meta.url,
),"utf8");
const finance=readFileSync(new URL(
  "../supabase/migrations/20261102191500_mealdeck_ops_recipe_finance.sql",import.meta.url,
),"utf8");

describe("MealDeck staff permissions — UI hints and DB contracts",()=>{
  it("defines explicit roles and permissions for each operating function",()=>{
    expect(Object.keys(OPS_ROLE_PERMISSIONS)).toEqual([
      "owner","admin","operations","kitchen","menu","finance","analyst","viewer",
    ]);
    expect(OPS_PERMISSIONS).toContain("staff.manage");
    expect(OPS_PERMISSIONS).toContain("costs.read");
  });
  it("never inherits access from an unrelated tenant or kitchen",()=>{
    const scopes=[staff("operations")];
    expect(effectiveOpsPermissions(scopes,tenantA,kitchenA).has("orders.read")).toBe(true);
    expect(effectiveOpsPermissions(scopes,tenantA,kitchenB).size).toBe(0);
    expect(effectiveOpsPermissions(scopes,tenantB,kitchenA).size).toBe(0);
    expect(effectiveOpsPermissions(scopes,tenantA,null).size).toBe(0);
  });
  it("hides finances and staff edits from kitchen users",()=>{
    const p=effectiveOpsPermissions([staff("kitchen")],tenantA,kitchenA);
    expect(p.has("orders.read")).toBe(true);
    expect(p.has("recipes.read")).toBe(true);
    expect(p.has("finance.read")).toBe(false);
    expect(p.has("costs.read")).toBe(false);
    expect(p.has("staff.manage")).toBe(false);
  });
  it("applies per-person grants and location denials even when owner has global access",()=>{
    const p=effectiveOpsPermissions([
      staff("owner",tenantA,null),
      staff("viewer",tenantA,kitchenA,[],["finance.read","recipes.read"]),
    ],tenantA,kitchenA);
    expect(p.has("orders.read")).toBe(true);
    expect(p.has("finance.read")).toBe(false);
    expect(p.has("recipes.read")).toBe(false);
    const elsewhere=effectiveOpsPermissions([staff("owner",tenantA,null)],tenantA,kitchenB);
    expect(elsewhere.has("finance.read")).toBe(true);
  });
  it("never shows staff management unless the role includes it",()=>{
    expect(effectiveOpsPermissions([staff("analyst")],tenantA,kitchenA).has("staff.read")).toBe(false);
    expect(effectiveOpsPermissions([staff("finance")],tenantA,kitchenA).has("staff.manage")).toBe(false);
  });
});
describe("Food cost helpers and finance truthfulness",()=>{
  it("handles money exactly to the penny and refuses invalid formats",()=>{
    expect(poundsToPence("12.34")).toBe(1234);
    expect(poundsToPence("12.3")).toBe(1230);
    expect(poundsToPence("1.234")).toBeNull();
    expect(poundsToPence("-1.00")).toBeNull();
    expect(penceToPounds(1234)).toBe("£12.34");
  });
  it("converts a supplier pack to cost per gram/ml/unit",()=>{
    expect(packCostPerBaseUnit(600,1000)).toBe(0.6);
    expect(packCostPerBaseUnit(500,0)).toBeNull();
    expect(packCostPerBaseUnit(-1,1000)).toBeNull();
  });
  it("does not present missing ingredients as free or estimate net profit",()=>{
    expect(estimatedRecipeMargin(1000,null)).toBeNull();
    expect(estimatedRecipeMargin(0,100)).toBeNull();
    expect(estimatedRecipeMargin(1000,350)).toEqual({
      foodCostPercent:35,estimatedContributionPence:650,
    });
  });
  it("rejects malformed daily analytics instead of drawing misleading bars",()=>{
    expect(cleanDailySeries([
      {date:"2026-11-01",orders:3,grossPence:4500},
      {date:"x",orders:3,grossPence:4500},
      {date:"2026-11-02",orders:-1,grossPence:100},
    ])).toHaveLength(1);
  });
});
describe("Database source contracts — staging replay still required",()=>{
  it("keeps role assignment deny-by-default with no self-escalation",()=>{
    expect(core).toContain("create table public.mealdeck_ops_staff_access");
    expect(core).toContain("alter table public.mealdeck_ops_staff_access enable row level security");
    expect(core).toContain("revoke all on public.mealdeck_ops_staff_access from public,anon,authenticated");
    expect(core).toContain("p_user=(select auth.uid())");
    expect(core).toContain("mealdeck_ops_no_self_role_changes");
    expect(core).toContain("mealdeck_ops_owner_approval_required");
    expect(core).toContain("and not exists(");
    expect(core).toContain("p_permission=any(denied.deny_permissions)");
    expect(core).toContain("private.mealdeck_ops_can");
    expect(core).not.toContain("user_metadata");
  });
  it("authorises menu writes only via permission-checked RPCs",()=>{
    expect(core).toContain("mealdeck_ops_global_menu_permission_required");
    expect(core).toContain("mealdeck_ops_location_mismatch");
    expect(core).toContain("channel_key='mealdeck'");
    expect(core).toContain("create table public.mealdeck_ops_audit_log");
    expect(core).toContain("'staff.assignment'");
    expect(core).toContain("'menu.update'");
  });
  it("protects recipes, unit costs, stock, and expenses with RLS",()=>{
    for(const table of [
      "mealdeck_ops_ingredients","mealdeck_ops_recipes",
      "mealdeck_ops_recipe_lines","mealdeck_ops_recipe_history",
      "mealdeck_ops_ingredient_costs","mealdeck_ops_stock_movements",
      "mealdeck_ops_expenses",
    ]){
      expect(finance).toContain("'"+table+"'");
    }
    expect(finance).toContain("enable row level security");
    expect(finance).toContain("from public,anon,authenticated");
    expect(finance).toContain("'costs.read'");
    expect(finance).toContain("'finance.read'");
    expect(finance).toContain("'recipes.write'");
    expect(finance).toContain("mealdeck_ops_ingredient_unit_in_use");
  });
  it("reads canonical orders and never changes paid or KDS state",()=>{
    expect(finance).toContain("from public.orders o");
    expect(finance).toContain("public.order_items i");
    expect(finance).toContain("o.paid_at");
    expect(finance).toContain("mealdeck_ops_order_lines");
    expect(finance).toContain("v_refunds");
    expect(finance).toContain("'vatCalculated',false");
    expect(finance).toContain("'actualCogsCalculated',false");
    expect(finance).toContain("'bankSettlementVerified',false");
    expect(finance).not.toContain("release_order_to_kds(");
    expect(finance).not.toContain("confirm_order_payment(");
    expect(finance).not.toContain("update public.orders");
  });
});
