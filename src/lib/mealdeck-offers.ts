import { OPENING_OFFER_PERCENT } from "./mealdeck-opening-offer";
import { MEALDECK_LAUNCH_DAYS } from "./mealdeck-launch-schedule";
import { MILKCAKE_PROMOTION_TERMS } from "./mealdeck-milkcake-promotion";

/**
 * Owner-approved public terms, updated 8 November 2026. This catalogue publishes offers;
 * it cannot grant discounts, issue points or enable a payment channel.
 * Pricing and membership evidence remain the independent MealDeck server's job.
 */
export const MEALDECK_OFFERS_TERMS_VERSION = "mealdeck-offers-20261108-v5";
export const MEALDECK_OFFERS_TIME_ZONE = "Europe/London";

export const MILK_CAKE_CAMPAIGN = Object.freeze({
  date: "2026-11-08",
  pricePence: 99,
  requiresOrder: true,
  registrationRequired: false,
  maximumPerOrder: 1,
  additionalPricePence: 399,
  // Publication alone never grants pricing. Only validated server metadata does.
  pricingAuthority: "server",
} as const);

const milkCakeLaunchDay = MEALDECK_LAUNCH_DAYS.find((day) => day.date === MILK_CAKE_CAMPAIGN.date);

export const DOUBLE_POINTS_CAMPAIGN = Object.freeze({
  minimumSpendPence: 1_500,
  multiplier: 2,
  startsOn: "2026-11-09",
  startsAtInclusive: "2026-11-09T00:00:00+00:00",
  throughDate: "2026-11-13",
  // Monday through Friday inclusive; these dates do not establish kitchen hours.
  endsAtExclusive: "2026-11-14T00:00:00+00:00",
  registrationRequired: true,
  marketingOptInRequired: false,
  // No base earning rate or spend calculation basis was supplied by the owner.
  basePointsPerPound: null,
  minimumSpendBasis: null,
  automaticAwardsEnabled: false,
} as const);

export type MealDeckOffer = {
  id: "opening-weekend" | "sunday-milk-cake" | "double-points";
  rank: string;
  suit: "burger" | "cake" | "french-taco";
  title: string;
  value: string;
  description: string;
  dateLabel: string;
  startsOn: string | null;
  throughDate: string;
  audience: string;
  terms: readonly string[];
};

/** The complete public promotion list. Retired sample deals do not belong here. */
export const MEALDECK_OFFERS: readonly MealDeckOffer[] = [
  {
    id: "opening-weekend",
    rank: "A",
    suit: "burger",
    title: "Off the entire menu",
    value: `${OPENING_OFFER_PERCENT}%`,
    description: "Three opening days. Every craving. No minimum order.",
    dateLabel: "Friday 6 – Sunday 8 November 2026",
    startsOn: "2026-11-06",
    throughDate: "2026-11-08",
    audience: "Guests and members",
    terms: [
      "30% off the entire menu from Friday 6 to Sunday 8 November 2026, during opening hours.",
      "Includes food, drinks, add-ons and meal upgrades. No minimum order value.",
      "Available to guests and registered members for Luton collection or kerbside pickup.",
    ],
  },
  {
    id: "sunday-milk-cake",
    rank: "9",
    suit: "cake",
    title: "Milk cake with every order",
    value: `${MILK_CAKE_CAMPAIGN.pricePence}p`,
    description: "A Sunday treat: one milkcake for 99p with every order. T&Cs apply.",
    dateLabel: "Sunday 8 November 2026",
    startsOn: MILK_CAKE_CAMPAIGN.date,
    throughDate: MILK_CAKE_CAMPAIGN.date,
    audience: "Guests and members",
    terms: [
      "One milkcake for 99p with every order on Sunday 8 November 2026.",
      MILKCAKE_PROMOTION_TERMS,
      `Available during Sunday's opening hours${milkCakeLaunchDay ? `, ${milkCakeLaunchDay.hoursLabel},` : ""} for Luton collection or kerbside pickup.`,
    ],
  },
  {
    id: "double-points",
    rank: "2",
    suit: "french-taco",
    title: "Double loyalty points",
    value: `${DOUBLE_POINTS_CAMPAIGN.multiplier}×`,
    description:
      "Register and spend £15 or more from Monday 9 to Friday 13 November inclusive to get double loyalty points.",
    dateLabel: "Monday 9 – Friday 13 November 2026, inclusive",
    startsOn: DOUBLE_POINTS_CAMPAIGN.startsOn,
    throughDate: DOUBLE_POINTS_CAMPAIGN.throughDate,
    audience: "Registered members",
    terms: [
      "Register and spend £15 or more from Monday 9 to Friday 13 November 2026 inclusive to get double loyalty points.",
      "Use your registered MealDeck account. Guest orders earn no loyalty points.",
      "Email marketing and promotional app alerts are optional, separate choices. Neither is required for this offer.",
    ],
  },
];
