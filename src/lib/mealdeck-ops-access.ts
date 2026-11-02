import type {OpsAccess,OpsRole} from "./mealdeck-ops-browser";

export const OPS_PERMISSIONS=[
  "menu.read","menu.write","orders.read","orders.status",
  "recipes.read","recipes.write","costs.read","costs.write",
  "finance.read","finance.manage","analytics.read",
  "inventory.read","inventory.write","staff.read","staff.manage",
] as const;
export type OpsPermission=(typeof OPS_PERMISSIONS)[number];

export const OPS_ROLE_PERMISSIONS:Record<OpsRole,readonly OpsPermission[]>={
  owner:OPS_PERMISSIONS,
  admin:OPS_PERMISSIONS,
  operations:[
    "menu.read","orders.read","orders.status","recipes.read",
    "analytics.read","inventory.read","inventory.write",
  ],
  kitchen:["menu.read","orders.read","orders.status","recipes.read","inventory.read"],
  menu:["menu.read","menu.write","recipes.read","recipes.write","inventory.read"],
  finance:[
    "menu.read","orders.read","recipes.read","costs.read","costs.write",
    "finance.read","finance.manage","analytics.read","inventory.read",
  ],
  analyst:["menu.read","analytics.read"],
  viewer:["menu.read"],
};

export function effectiveOpsPermissions(
  accesses:readonly OpsAccess[],
  tenantId:string,locationId:string|null,
):Set<OpsPermission>{
  const valid=new Set<string>(OPS_PERMISSIONS);
  const permitted=new Set<OpsPermission>();
  // Denials win over grants for a location. A location assignment never
  // authorizes global operations (locationId=null).
  const relevant=accesses.filter(a=>
    a.tenant_id===tenantId &&
    (a.location_id===null||(locationId!==null&&a.location_id===locationId)));
  const denied=new Set(relevant.flatMap(a=>a.deny_permissions));
  for(const entry of relevant){
    for(const perm of [
      ...OPS_ROLE_PERMISSIONS[entry.role]??[],
      ...entry.grant_permissions,
    ]){
      if(valid.has(perm)&&!denied.has(perm))permitted.add(perm as OpsPermission);
    }
  }
  return permitted;
}
export const OPS_SECTIONS=[
  {id:"overview",label:"Overview",permission:"analytics.read"},
  {id:"menu",label:"Menus",permission:"menu.read"},
  {id:"orders",label:"Order history",permission:"orders.read"},
  {id:"recipes",label:"Recipes",permission:"recipes.read"},
  {id:"ingredients",label:"Ingredients & stock",permission:"inventory.read"},
  {id:"costs",label:"Food costs",permission:"costs.read"},
  {id:"finance",label:"Financials",permission:"finance.read"},
  {id:"team",label:"Staff access",permission:"staff.read"},
] as const;
export type OpsSection=(typeof OPS_SECTIONS)[number]["id"];
