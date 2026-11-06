/** Temporary customer experience only; never grants payment or staff authority. */
export const EMAIL_REGISTRATION_RESUMES_AT = "2026-11-09T00:00:00.000Z";
export const QUICK_CHECKOUT_BEGINS_AT = "2026-11-06T00:00:00.000Z";
export const KERBSIDE_PARKING_INSTRUCTION =
  "Please park near our location, somewhere safe and legal, and keep your phone nearby.";

export type CustomerEntryPolicy = {
  emailRegistrationDeferred: boolean;
  registrationResumesAt: string;
  serverNow: string;
};

export function customerEntryPolicy(at: Date = new Date()): CustomerEntryPolicy {
  const now = at.getTime();
  if (!Number.isFinite(now)) throw new Error("Invalid customer entry clock");
  return {
    emailRegistrationDeferred:
      now >= Date.parse(QUICK_CHECKOUT_BEGINS_AT) &&
      now < Date.parse(EMAIL_REGISTRATION_RESUMES_AT),
    registrationResumesAt: EMAIL_REGISTRATION_RESUMES_AT,
    serverNow: at.toISOString(),
  };
}
