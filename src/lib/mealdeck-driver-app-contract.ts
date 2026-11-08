/** Driver-app state contract. This is NOT an authorisation layer: the backend must verify
 * tenant, location, assignment, payment, proof, version and idempotency atomically. */
export type DriverState = "offered"|"assigned"|"at_kitchen"|"collected"|"at_customer"|"delivered"|"failed"|"cancelled";
export type DriverAction = "accept"|"decline"|"arrive_kitchen"|"pickup"|"arrive_customer"|"deliver"|"report_issue";
export type DriverJob = { id:string; driverId:string|null; status:DriverState; version:number; paid:boolean; ready:boolean; sealed:boolean; pickupVerified:boolean; deliveryVerified:boolean };
export type DriverCommand = { jobId:string; driverId:string; version:number; action:DriverAction; idempotencyKey:string };
const allowed: Record<DriverAction,DriverState[]> = {
  accept:["offered"], decline:["offered"], arrive_kitchen:["assigned"],
  pickup:["at_kitchen"], arrive_customer:["collected"],
  deliver:["at_customer"], report_issue:["assigned","at_kitchen","collected","at_customer"],
};
export function checkDriverAction(job:DriverJob,cmd:DriverCommand): {allowed:boolean;reason:string} {
  if (!job || !cmd || !job.id || job.id!==cmd.jobId || !cmd.driverId ||
      !Number.isSafeInteger(job.version) || job.version<0 || job.version!==cmd.version ||
      !/^[a-zA-Z0-9_-]{12,100}$/.test(cmd.idempotencyKey||""))
    return {allowed:false,reason:"invalid_or_stale"};
  if (!Object.prototype.hasOwnProperty.call(allowed,cmd.action) ||
      !allowed[cmd.action].includes(job.status)) return {allowed:false,reason:"invalid_transition"};
  if (!job.paid) return {allowed:false,reason:"payment_unverified"};
  if (cmd.action==="accept") return job.driverId===null
    ? {allowed:true,reason:"ok"} : {allowed:false,reason:"already_assigned"};
  if (job.driverId!==cmd.driverId) return {allowed:false,reason:"not_assigned_driver"};
  if (cmd.action==="pickup" && (!job.ready || !job.sealed || !job.pickupVerified))
    return {allowed:false,reason:"pickup_not_verified"};
  if (cmd.action==="deliver" && !job.deliveryVerified)
    return {allowed:false,reason:"delivery_not_verified"};
  return {allowed:true,reason:"ok"};
}
/** GPS consent is opt-in, limited to the on-shift driver with an active assignment. */
export function canShareDriverLocation(v:{consent:boolean;onShift:boolean;activeAssignment:boolean;accuracyMetres:number;ageSeconds:number}):boolean {
  return v.consent===true && v.onShift===true && v.activeAssignment===true &&
    Number.isFinite(v.accuracyMetres) && v.accuracyMetres>0 && v.accuracyMetres<=100 &&
    Number.isFinite(v.ageSeconds) && v.ageSeconds>=0 && v.ageSeconds<=30;
}
