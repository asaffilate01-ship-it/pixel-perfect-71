/**
 * Source-only contract for a future VERIFIED MealDeck staff discount.
 *
 * IMPORTANT: This file is not a credential or discount authority. Only an
 * owner-reviewed, private database campaign plus a signed provider result and
 * an atomic quote/payment claim can apply a price reduction. In particular,
 * NEVER hydrate "verification" or "campaign" from browser request payloads.
 */
export const MEALDECK_PROFESSIONAL_DISCOUNTS_LIVE = false as const;

export const PROFESSIONAL_DISCOUNT_CATEGORIES = [
  "nhs_healthcare",
  "police",
  "fire_rescue",
  "ambulance",
  "education",
  "social_care",
  "armed_forces",
] as const;
export type ProfessionalDiscountCategory = (typeof PROFESSIONAL_DISCOUNT_CATEGORIES)[number];

export const PROFESSIONAL_VERIFICATION_PROVIDERS = [
  "blue_light_card_partner_api",
  "gocertify",
  "sheerid",
] as const;
export type ProfessionalVerificationProvider = (typeof PROFESSIONAL_VERIFICATION_PROVIDERS)[number];

export type ServerVerifiedProfessionalIdentity = Readonly<{
  /** From a signature-verified provider callback or server-to-provider readback. */
  provider: ProfessionalVerificationProvider;
  /** Authentication database subject; never browser-supplied user_metadata. */
  customerId: string;
  category: ProfessionalDiscountCategory;
  verifiedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}>;

export type ProfessionalCampaignPolicy = Readonly<{
  id: string;
  enabled: boolean;
  /** Must be enabled only AFTER a verified provider contract and checkout approval. */
  providerIntegrationApproved: boolean;
  rateBps: number;
  maximumDiscountPence: number;
  minimumEligiblePence: number;
  startsAt: string;
  endsAt: string;
  eligibleCategories: readonly ProfessionalDiscountCategory[];
  allowStacking: false;
  maximumClaimsPerDay: number;
}>;

export type TrustedProfessionalCheckoutFacts = Readonly<{
  /** All these fields MUST come from server-side verified user and canonical quote. */
  customerId: string | null;
  emailConfirmed: boolean;
  discountableSubtotalPence: number;
  alreadyPromoted: boolean;
  paymentInProgress: boolean;
  /** Count under a DB lock for the same verified subject and calendar day. */
  claimsToday: number;
  providerEvidenceReadbackSucceeded: boolean;
}>;

export type ProfessionalDiscountDecision =
  | Readonly<{ eligible: true; discountPence: number; campaignId: string }>
  | Readonly<{ eligible: false; discountPence: 0; reason: string }>;

const denied = (reason: string): ProfessionalDiscountDecision =>
  ({ eligible: false, discountPence: 0, reason });

const validInstant = (value: string) => Number.isFinite(Date.parse(value));
const validMoney = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Exact integer-pence computation; never use floating-point percentage maths. */
export function professionalDiscountPence(
  canonicalEligiblePence: number,
  rateBps: number,
  capPence: number,
): number {
  if (!validMoney(canonicalEligiblePence) ||
      !Number.isSafeInteger(rateBps) || rateBps < 1 || rateBps > 2000 ||
      !validMoney(capPence) || capPence === 0)
    throw new Error("Invalid professional discount terms");
  return Number(
    (BigInt(canonicalEligiblePence) * BigInt(rateBps)) / 10_000n <
      BigInt(capPence)
      ? (BigInt(canonicalEligiblePence) * BigInt(rateBps)) / 10_000n
      : BigInt(capPence),
  );
}

/**
 * A safe, fail-closed contract for future private quote integration.
 * This does NOT persist, grant, reserve or display a discount.
 */
export function evaluateVerifiedProfessionalDiscount(input: {
  campaign: ProfessionalCampaignPolicy | null;
  verification: ServerVerifiedProfessionalIdentity | null;
  checkout: TrustedProfessionalCheckoutFacts;
  serverNow: string;
}): ProfessionalDiscountDecision {
  const { campaign, verification, checkout, serverNow } = input;
  if (!campaign?.enabled || !campaign.providerIntegrationApproved)
    return denied("campaign_not_approved");
  if (!validInstant(serverNow) || !validInstant(campaign.startsAt) ||
      !validInstant(campaign.endsAt) || campaign.startsAt >= campaign.endsAt ||
      Date.parse(serverNow) < Date.parse(campaign.startsAt) ||
      Date.parse(serverNow) >= Date.parse(campaign.endsAt))
    return denied("campaign_outside_window");
  if (campaign.allowStacking !== false ||
      !Number.isSafeInteger(campaign.maximumClaimsPerDay) ||
      campaign.maximumClaimsPerDay < 1 || campaign.maximumClaimsPerDay > 2 ||
      !validMoney(campaign.minimumEligiblePence))
    return denied("campaign_policy_invalid");
  if (!checkout.customerId || !checkout.emailConfirmed)
    return denied("verified_mealdeck_account_required");
  if (checkout.paymentInProgress)
    return denied("payment_attempt_already_started");
  if (checkout.alreadyPromoted) return denied("non_stackable");
  if (!checkout.providerEvidenceReadbackSucceeded || !verification ||
      verification.customerId !== checkout.customerId ||
      !PROFESSIONAL_VERIFICATION_PROVIDERS.includes(verification.provider) ||
      !PROFESSIONAL_DISCOUNT_CATEGORIES.includes(verification.category) ||
      !campaign.eligibleCategories.includes(verification.category) ||
      verification.revokedAt !== null || !validInstant(verification.verifiedAt) ||
      !validInstant(verification.expiresAt) ||
      Date.parse(verification.verifiedAt) > Date.parse(serverNow) ||
      Date.parse(verification.expiresAt) <= Date.parse(serverNow))
    return denied("independent_eligibility_verification_required");
  if (!validMoney(checkout.claimsToday) ||
      checkout.claimsToday >= campaign.maximumClaimsPerDay)
    return denied("daily_limit_reached");
  if (!validMoney(checkout.discountableSubtotalPence) ||
      checkout.discountableSubtotalPence < campaign.minimumEligiblePence)
    return denied("minimum_spend_not_met");
  try {
    const discountPence = professionalDiscountPence(
      checkout.discountableSubtotalPence,
      campaign.rateBps,
      campaign.maximumDiscountPence,
    );
    return discountPence > 0
      ? { eligible: true, discountPence, campaignId: campaign.id }
      : denied("no_discountable_amount");
  } catch {
    return denied("campaign_policy_invalid");
  }
}
