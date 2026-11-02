/**
 * Pure shared-checkout invitation and allocation validation.
 * Server must authenticate owner, store hashed invite tokens, verify expiry,
 * lock allocation revisions before creating provider payment sessions.
 */
export type Invite={
 id:string; participantId:string; amountPence:number;
 status:"invited"|"accepted"|"declined"|"expired"|"revoked";
 expiresAt:string;
};
export type AllocationPlan={
 orderId:string; currency:string; totalPence:number; ownerId:string;
 revision:number; locked:boolean; invites:readonly Invite[];
 ownerAmountPence:number;
};
export type PlanCheck={
 valid:boolean; code:"ready"|"invalid_total"|"invalid_owner"|"duplicate_invite"|
 "invalid_share"|"allocation_mismatch"|"expired_invite"|"declined_invite"|
 "invalid_revision"|"already_locked";
};
const money=(v:number)=>Number.isSafeInteger(v)&&v>=0;
export function validateAllocationPlan(plan:AllocationPlan,nowIso:string):PlanCheck{
 const fail=(code:PlanCheck["code"]):PlanCheck=>({valid:false,code});
 const now=Date.parse(nowIso);
 if(!Number.isFinite(now))return fail("expired_invite");
 if(!plan.orderId||!plan.currency||!money(plan.totalPence)||plan.totalPence===0)return fail("invalid_total");
 if(!plan.ownerId)return fail("invalid_owner");
 if(!Number.isSafeInteger(plan.revision)||plan.revision<0)return fail("invalid_revision");
 if(plan.locked)return fail("already_locked");
 if(!money(plan.ownerAmountPence))return fail("invalid_share");
 const ids=new Set<string>(),people=new Set<string>([plan.ownerId]);
 let allocated=plan.ownerAmountPence;
 for(const invite of plan.invites){
  if(!invite.id||!invite.participantId||ids.has(invite.id)||people.has(invite.participantId))return fail("duplicate_invite");
  ids.add(invite.id);people.add(invite.participantId);
  if(!money(invite.amountPence)||invite.amountPence===0)return fail("invalid_share");
  if(invite.status==="declined"||invite.status==="revoked")return fail("declined_invite");
  if(invite.status==="expired"||!Number.isFinite(Date.parse(invite.expiresAt))||Date.parse(invite.expiresAt)<=now)return fail("expired_invite");
  allocated+=invite.amountPence;
  if(!Number.isSafeInteger(allocated))return fail("invalid_share");
 }
 if(allocated!==plan.totalPence)return fail("allocation_mismatch");
 return {valid:true,code:"ready"};
}
export function redactInvitation(plan:AllocationPlan,viewerId:string){
 const personal=viewerId===plan.ownerId;
 const own=plan.invites.find(i=>i.participantId===viewerId);
 return {
  orderId:plan.orderId,currency:plan.currency,
  totalPence:personal?plan.totalPence:null,
  revision:plan.revision,locked:plan.locked,
  ownAmountPence:personal?plan.ownerAmountPence:own?.amountPence??null,
  ownStatus:personal?"owner":own?.status??"not_invited",
  participantCount:personal?plan.invites.length:null,
 };
}
