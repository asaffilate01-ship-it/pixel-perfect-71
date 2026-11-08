import { CheckoutProblem } from "./mealdeck-checkout-selection";
import {
  checkOwnDriverArea,
  ownDriverShortfallPence,
  OwnDriverInvalidPostcode,
  OwnDriverPostcodeUnavailable,
} from "./mealdeck-own-driver-delivery";

type PaymentCandidate = { fulfilment: unknown; totalPence: unknown };
type PaymentCheck = {
  order: PaymentCandidate;
  deliveryEnabled: boolean;
  readQuote: () => Promise<Record<string, unknown>>;
  fetcher?: typeof fetch;
};

/**
 * Runs against the canonical, actor-scoped prepared order before any Stripe
 * checkout session is created or resumed. Pickup never depends on geocoding or
 * a delivery extension. Disabling delivery also rejects previously bound quotes.
 */
export async function verifyOwnDriverPayment({
  order,
  deliveryEnabled,
  readQuote,
  fetcher = fetch,
}: PaymentCheck): Promise<void> {
  if (order.fulfilment === "pickup" || order.fulfilment === "curbside") return;
  if (order.fulfilment !== "delivery") {
    throw new CheckoutProblem("invalid_fulfilment", "Please review your order method.", 503);
  }
  if (!deliveryEnabled) {
    throw new CheckoutProblem(
      "delivery_unavailable",
      "New delivery payments are paused. Your basket remains saved. Please choose collection.",
      503,
    );
  }
  const quote = await readQuote();
  if (quote.delivery !== true || quote.totalPence !== order.totalPence) {
    throw new CheckoutProblem(
      "delivery_quote_invalid",
      "Your delivery details need to be checked again. Please review your order.",
      409,
    );
  }
  const shortfall = ownDriverShortfallPence(order.totalPence as number);
  if (shortfall === null) {
    throw new CheckoutProblem("delivery_quote_invalid", "Please review your order total.", 503);
  }
  if (shortfall > 0) {
    throw new CheckoutProblem(
      "minimum_delivery_order",
      `Your payable total is £${(shortfall / 100).toFixed(2)} short of free delivery. Add food to reach £15 after discounts, or choose collection.`,
    );
  }
  try {
    const area = await checkOwnDriverArea(quote.postcode, fetcher);
    if (!area.eligible) {
      throw new CheckoutProblem(
        "outside_delivery_area",
        "Sorry, we are not currently delivering to your location. You can choose collection or kerbside pickup.",
      );
    }
  } catch (error) {
    if (
      error instanceof OwnDriverInvalidPostcode ||
      error instanceof OwnDriverPostcodeUnavailable
    ) {
      throw new CheckoutProblem(
        "area_unavailable",
        "We could not confirm your delivery postcode. Please try again, or choose collection.",
        503,
      );
    }
    throw error;
  }
}
