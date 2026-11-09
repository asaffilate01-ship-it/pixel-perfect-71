import { describe, expect, test } from "bun:test";
import {
  MEALDECK_PROFESSIONAL_DISCOUNTS_LIVE,
  PROFESSIONAL_DISCOUNT_CATEGORIES,
  professionalDiscountPence,
  evaluateVerifiedProfessionalDiscount,
  type ProfessionalCampaignPolicy,
  type ServerVerifiedProfessionalIdentity,
  type TrustedProfessionalCheckoutFacts,
} from "../src/lib/mealdeck-professional-discounts";

const now = "2026-11-09T17:30:00.000Z";
const policy: ProfessionalCampaignPolicy = {
  id: "fixture-not-a-live-campaign",
  enabled: true,
  providerIntegrationApproved: true,
  startsAt: "2026-11-09T00:00:00Z",
  endsAt: "2026-11-13T00:00:00Z",
  eligibleCategories: ["nhs_healthcare", "police", "fire_rescue", "education"],
  rateBps: 1000, // test fixture only, NOT a proposed or live offer
  maximumDiscountPence: 500,
  minimumEligiblePence: 1500,
  allowStacking: false,
  maximumClaimsPerDay: 1,
};
const verification: ServerVerifiedProfessionalIdentity = {
  customerId: "fixture-customer",
  provider: "gocertify",
  category: "education",
  verifiedAt: "2026-11-09T10:00:00Z",
  expiresAt: "2026-11-10T10:00:00Z",
  revokedAt: null,
};
const checkout: TrustedProfessionalCheckoutFacts = {
  customerId: "fixture-customer",
  emailConfirmed: true,
  discountableSubtotalPence: 3299,
  alreadyPromoted: false,
  paymentInProgress: false,
  claimsToday: 0,
  providerEvidenceReadbackSucceeded: true,
};
const quote = (
  campaign: ProfessionalCampaignPolicy | null = policy,
  evidence: ServerVerifiedProfessionalIdentity | null = verification,
  payment: TrustedProfessionalCheckoutFacts = checkout,
  serverNow = now,
) => evaluateVerifiedProfessionalDiscount({campaign,verification:evidence,checkout:payment,serverNow});

describe("MealDeck verified professional discount guardrails", () => {
  test("the offering is not enabled in production source", () => {
    expect(MEALDECK_PROFESSIONAL_DISCOUNTS_LIVE).toBe(false);
    expect(PROFESSIONAL_DISCOUNT_CATEGORIES).toContain("nhs_healthcare");
    expect(PROFESSIONAL_DISCOUNT_CATEGORIES).toContain("police");
    expect(PROFESSIONAL_DISCOUNT_CATEGORIES).toContain("fire_rescue");
    expect(PROFESSIONAL_DISCOUNT_CATEGORIES).toContain("education");
  });
  test("not activated or not contractually verified means no discount", () => {
    expect(quote(null).eligible).toBe(false);
    expect(quote({...policy,enabled:false}).eligible).toBe(false);
    expect(quote({...policy,providerIntegrationApproved:false}).eligible).toBe(false);
  });
  test("neither a fake category nor an unverifiable customer can earn the discount", () => {
    expect(quote(policy,null).eligible).toBe(false);
    expect(quote(policy,{...verification,customerId:"other"}).eligible).toBe(false);
    expect(quote(policy,{...verification,category:"social_care"}).eligible).toBe(false);
    expect(quote(policy,{...verification,revokedAt:now}).eligible).toBe(false);
    expect(quote(policy,verification,{...checkout,providerEvidenceReadbackSucceeded:false}).eligible).toBe(false);
    expect(quote(policy,verification,{...checkout,emailConfirmed:false}).eligible).toBe(false);
    expect(quote(policy,verification,{...checkout,customerId:null}).eligible).toBe(false);
  });
  test("expired proof, campaigns, concurrent payment and duplicate daily claims fail closed", () => {
    expect(quote(policy,{...verification,expiresAt:now}).eligible).toBe(false);
    expect(quote(policy,{...verification,verifiedAt:"2026-11-10T00:00:00Z"}).eligible).toBe(false);
    expect(quote(policy,verification,checkout,"2026-11-13T00:00:00Z").eligible).toBe(false);
    expect(quote(policy,verification,{...checkout,paymentInProgress:true}).eligible).toBe(false);
    expect(quote(policy,verification,{...checkout,claimsToday:1}).eligible).toBe(false);
    expect(quote(policy,verification,{...checkout,alreadyPromoted:true}).eligible).toBe(false);
    expect(quote(policy,verification,{...checkout,discountableSubtotalPence:1499}).eligible).toBe(false);
  });
  test("only canonical eligible pennies determine capped percentage, with integer rounding", () => {
    expect(professionalDiscountPence(3299,1000,500)).toBe(329);
    expect(professionalDiscountPence(15_000,1000,500)).toBe(500);
    expect(professionalDiscountPence(100,2000,500)).toBe(20);
    expect(()=>professionalDiscountPence(-1,1000,500)).toThrow();
    expect(()=>professionalDiscountPence(3299,2500,500)).toThrow();
    expect(quote()).toEqual({eligible:true,discountPence:329,campaignId:policy.id});
  });
});
