import { z } from "zod";

/** Read-only driver job summaries. Server must filter by authenticated driver + tenant. */
export const driverJobSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string().trim().min(1).max(40),
  status: z.enum(["offered","assigned","at_kitchen","collected","at_customer","delivered","failed","cancelled"]),
  version: z.number().int().nonnegative(),
  paid: z.literal(true),
  locationName: z.string().min(1).max(120),
  offeredAt: z.string().datetime({offset:true}),
  expiresAt: z.string().datetime({offset:true}).nullable(),
  bagCount: z.number().int().min(1).max(30),
}).strict();
export type DriverJobSummary = z.infer<typeof driverJobSummarySchema>;
export type DriverInbox = {
  offers: DriverJobSummary[];
  active: DriverJobSummary[];
  completed: DriverJobSummary[];
};
export function parseDriverInbox(input:unknown, now:string): DriverInbox {
  const clock=Date.parse(now);
  if (!Number.isFinite(clock)) throw new Error("driver_inbox_invalid_clock");
  const parsed=z.array(driverJobSummarySchema).max(100).safeParse(input);
  if (!parsed.success) throw new Error("driver_inbox_invalid_response");
  const seen=new Set<string>();
  const result:DriverInbox={offers:[],active:[],completed:[]};
  for(const job of parsed.data) {
    if(seen.has(job.id)) throw new Error("driver_inbox_duplicate_job");
    seen.add(job.id);
    const expires=job.expiresAt===null?null:Date.parse(job.expiresAt);
    if(job.status==="offered") {
      if(expires===null || !Number.isFinite(expires) || expires<=clock)
        continue; // expired offers must never be actionable
      result.offers.push(job);
    } else if(job.status==="delivered" || job.status==="failed" || job.status==="cancelled"){
      result.completed.push(job);
    } else {
      if (job.expiresAt!==null) throw new Error("driver_inbox_invalid_assignment");
      result.active.push(job);
    }
  }
  result.offers.sort((a,b)=>Date.parse(a.expiresAt!)-Date.parse(b.expiresAt!));
  result.active.sort((a,b)=>Date.parse(a.offeredAt)-Date.parse(b.offeredAt));
  return result;
}
export function driverJobActionLabel(status:DriverJobSummary["status"]):string|null {
  switch(status) {
    case "offered": return "Review offer";
    case "assigned": return "Navigate to kitchen";
    case "at_kitchen": return "Verify collection";
    case "collected": return "Navigate to customer";
    case "at_customer": return "Confirm handover";
    default: return null;
  }
}
