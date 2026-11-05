/** Known hosted Checkout origins only. These are public hostnames, never credentials. */
export const STRIPE_CHECKOUT_HOST = "checkout.stripe.com";
export const MEALDECK_STRIPE_CHECKOUT_HOST = "pay.mealdeck.co.uk";

/**
 * Preserve the URL issued by Stripe. Do not replace its hostname or rebuild its
 * path/query/fragment: those bytes belong to the original provider Session.
 *
 * The server opts in to the MealDeck hostname using its private configuration.
 * Browser callers use the same two-host allowlist as a second check on the
 * verified same-origin API response; a URL never proves that an order is paid.
 */
export function safeHostedCheckoutUrl(
  value: unknown,
  customHostname: typeof MEALDECK_STRIPE_CHECKOUT_HOST | null = null,
): string | null {
  if (typeof value !== "string" || value.length > 4096 || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      url.href !== value ||
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      (url.hostname !== STRIPE_CHECKOUT_HOST &&
        !(customHostname === MEALDECK_STRIPE_CHECKOUT_HOST && url.hostname === customHostname)) ||
      !/^\/c\/pay\/cs_[A-Za-z0-9_]+$/.test(url.pathname) ||
      !/^https:\/\/[^/]+\/c\/pay\/cs_[A-Za-z0-9_]+(?:\?[A-Za-z0-9_/=?%&.~+:-]*)?(?:#[A-Za-z0-9_/=?%&#.~+:-]*)?$/.test(
        value,
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

/** Defense in depth for the existing same-origin checkout API responses. */
export function safeMealDeckCheckoutRedirect(value: unknown): string | null {
  return safeHostedCheckoutUrl(value, MEALDECK_STRIPE_CHECKOUT_HOST);
}
