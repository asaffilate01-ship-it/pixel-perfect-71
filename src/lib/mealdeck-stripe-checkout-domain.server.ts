import { MEALDECK_STRIPE_CHECKOUT_HOST, STRIPE_CHECKOUT_HOST } from "./mealdeck-checkout-url";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

export type MealDeckStripeCheckoutDomain =
  | { status: "default"; hostname: typeof STRIPE_CHECKOUT_HOST }
  | { status: "configured"; hostname: typeof MEALDECK_STRIPE_CHECKOUT_HOST }
  | { status: "invalid"; hostname: null };

/** Allowlisting is configuration, not evidence of Stripe domain activation. */
export function readMealDeckStripeCheckoutDomain(
  env: MealDeckRuntimeEnv,
): MealDeckStripeCheckoutDomain {
  const value = env["MEALDECK_STRIPE_CHECKOUT_HOST"]?.trim();
  if (!value) return { status: "default", hostname: STRIPE_CHECKOUT_HOST };
  if (value === MEALDECK_STRIPE_CHECKOUT_HOST)
    return { status: "configured", hostname: MEALDECK_STRIPE_CHECKOUT_HOST };
  return { status: "invalid", hostname: null };
}
