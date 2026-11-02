import {describe,expect,test} from "bun:test";
import {redactInvitation,validateAllocationPlan,type AllocationPlan} from "../src/lib/mealdeck-group-invitations";
const now="2026-11-02T21:00:00Z";
const plan=():AllocationPlan=>({orderId:"order-1",currency:"GBP",totalPence:3000,ownerId:"owner",revision:0,locked:false,
 ownerAmountPence:1000,invites:[{id:"invite-1",participantId:"guest",amountPence:2000,status:"accepted",expiresAt:"2026-11-03T21:00:00Z"}]});
describe("shared checkout invitations",()=>{
 test("validates a complete owner and guest allocation",()=>expect(validateAllocationPlan(plan(),now)).toEqual({valid:true,code:"ready"}));
 test("blocks an expired invite",()=>expect(validateAllocationPlan(plan(),"2026-11-04T00:00:00Z").code).toBe("expired_invite"));
 test("blocks declined invitations",()=>{const p=plan();p.invites=[{...p.invites[0],status:"declined"}];expect(validateAllocationPlan(p,now).code).toBe("declined_invite")});
 test("blocks duplicate invitee and owner identities",()=>{const p=plan();p.invites=[...p.invites,{...p.invites[0],id:"invite-2"}];expect(validateAllocationPlan(p,now).code).toBe("duplicate_invite")});
 test("prevents incorrect split totals",()=>expect(validateAllocationPlan({...plan(),ownerAmountPence:200},now).code).toBe("allocation_mismatch"));
 test("prevents changing locked allocations",()=>expect(validateAllocationPlan({...plan(),locked:true},now).code).toBe("already_locked"));
 test("rejects floating-point and unsafe currency values",()=>expect(validateAllocationPlan({...plan(),totalPence:3.5},now).code).toBe("invalid_total"));
 test("does not expose other participant or total amounts",()=>{
  const view=redactInvitation(plan(),"guest");
  expect(view.ownAmountPence).toBe(2000);
  expect(view.totalPence).toBeNull();
  expect(view.participantCount).toBeNull();
  expect(JSON.stringify(view)).not.toContain("ownerAmountPence");
 });
 test("does not reveal private details to an uninvited viewer",()=>{
  const view=redactInvitation(plan(),"stranger");
  expect(view.ownAmountPence).toBeNull();
  expect(view.ownStatus).toBe("not_invited");
 });
});
