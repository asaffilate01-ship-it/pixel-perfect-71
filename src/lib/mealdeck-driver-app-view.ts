import { z } from "zod";

/** Only server-verified, assignment-scoped data may reach the driver screen. */
const address = z.strictObject({
  postcode: z.string().min(5).max(9),
  doorNumber: z.string().min(1).max(40),
  roadName: z.string().min(2).max(120),
  addressLine2: z.string().max(120),
});
export const driverJobSchema = z.strictObject({
  jobId: z.uuid(),
  status: z.enum(["offered", "assigned", "at_kitchen", "collected", "at_customer", "dropoff_reported", "declined", "delivered"]),
  version: z.number().int().min(1),
  offeredUntil: z.string().max(80).nullable(),
  driverStatus: z.enum(["awaiting_driver", "with_driver", "delivered"]),
  postcode: z.string().max(9),
  address: address.nullable(),
  customerName: z.string().max(140).nullable(),
  customerPhone: z.string().max(40).nullable(),
  createdAt: z.string().max(80),
});
export const driverPortalSchema = z.strictObject({
  displayName: z.string().min(1).max(100),
  onShift: z.boolean(),
  jobs: z.array(driverJobSchema).max(15),
});
export type DriverJobCard = z.infer<typeof driverJobSchema>;
export type DriverPortal = z.infer<typeof driverPortalSchema>;

export function parseDriverPortal(raw: unknown): DriverPortal {
  const parsed = driverPortalSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Driver jobs could not be verified. Refresh or contact the kitchen.");
  return parsed.data;
}

export type DriverJobAction = "accept" | "decline" | "arrive_kitchen" | "pickup" | "arrive_customer" | "report_dropoff";
export function driverActions(job: DriverJobCard, now: number): { action: DriverJobAction; label: string; disabledReason?: string }[] {
  if (job.driverStatus === "delivered" || job.status === "delivered" || job.status === "declined") return [];
  if (job.status === "offered") {
    if (!job.offeredUntil || !Number.isFinite(Date.parse(job.offeredUntil)) || Date.parse(job.offeredUntil) <= now) return [];
    return [{ action: "accept", label: "Accept delivery" }, { action: "decline", label: "Decline" }];
  }
  if (job.status === "assigned") return [{ action: "arrive_kitchen", label: "I'm at the kitchen" }];
  if (job.status === "at_kitchen") return [{
    action: "pickup", label: "Confirm collection",
    ...(job.driverStatus === "with_driver" ? {} : { disabledReason: "Kitchen must confirm and hand over the sealed bags first." }),
  }];
  if (job.status === "collected") return [{ action: "arrive_customer", label: "I've reached the customer" }];
  if (job.status === "at_customer") return [{ action: "report_dropoff", label: "Report handover to kitchen" }];
  return [];
}

/** Do not construct navigation links for an offer which has not been accepted. */
export function driverDirectionsUrl(job: DriverJobCard): string | null {
  if (!job.address || job.status === "offered" || job.status === "declined") return null;
  const { doorNumber, roadName, addressLine2, postcode } = job.address;
  return "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent([doorNumber, roadName, addressLine2, postcode, "UK"].filter(Boolean).join(", "));
}
