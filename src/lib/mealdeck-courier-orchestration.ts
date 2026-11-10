import { chooseDelivery, type DeliveryQuote } from "./mealdeck-delivery-selection";
import { planCourierBooking, type CourierBookingContext } from "./mealdeck-courier-booking-guard";

export const COURIER_PROVIDERS = [
  "own_fleet",
  "uber_direct",
  "deliveroo_express",
  "just_eat_go",
  "stuart",
] as const;
export type CourierProvider = (typeof COURIER_PROVIDERS)[number];
export const COURIER_PROVIDER_LABELS: Record<CourierProvider, string> = {
  own_fleet: "MealDeck own driver",
  uber_direct: "Uber Direct",
  deliveroo_express: "Deliveroo Express",
  just_eat_go: "Just Eat Go",
  stuart: "Stuart",
};

export type CourierProviderSetting = {
  provider: CourierProvider;
  enabled: boolean;
  connected: boolean;
};
export type CourierQuoteStatus =
  | "disabled" | "not_connected" | "unavailable" | "invalid_quote" | "quoted";
export type CourierQuoteResult = {
  provider: CourierProvider;
  status: CourierQuoteStatus;
  quote: DeliveryQuote | null;
};
export type CourierQuoteRequest = Readonly<{
  tenantId: string;
  locationId: string;
  orderId: string;
  currency: "GBP";
  requestedAt: string;
  maximumDeliveryMinutes: number;
}>;
export type CourierQuoteAdapter = (request: CourierQuoteRequest) => Promise<DeliveryQuote | null>;

/**
 * Called only on a trusted server after payment and kitchen readiness are confirmed.
 * Never use browser-supplied enabled flags, addresses or courier costs.
 * Provider adapters return real quotes from approved credentials, not estimates.
 * Fail closed on missing adapters, timeouts, zero prices without a genuine quote,
 * wrong provider/currency and expired quotations.
 */
export async function collectCourierQuotes(
  request: CourierQuoteRequest,
  providerSettings: readonly CourierProviderSetting[],
  adapters: Partial<Record<CourierProvider, CourierQuoteAdapter>>,
  timeoutMs = 8_000,
): Promise<CourierQuoteResult[]> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000)
    throw new Error("Invalid courier quote timeout");
  if (!Number.isFinite(Date.parse(request.requestedAt)) || request.currency !== "GBP" ||
      !Number.isSafeInteger(request.maximumDeliveryMinutes) ||
      request.maximumDeliveryMinutes < 1)
    return COURIER_PROVIDERS.map((provider) => ({ provider, status: "unavailable", quote: null }));
  const settings = new Map<CourierProvider, CourierProviderSetting>();
  for (const setting of providerSettings) {
    if (COURIER_PROVIDERS.includes(setting.provider) && !settings.has(setting.provider))
      settings.set(setting.provider, setting);
  }
  const now = Date.parse(request.requestedAt);
  return Promise.all(COURIER_PROVIDERS.map(async (provider): Promise<CourierQuoteResult> => {
    const setting = settings.get(provider);
    if (!setting?.enabled) return { provider, status: "disabled", quote: null };
    const quoteAdapter = adapters[provider];
    if (!setting.connected || !quoteAdapter)
      return { provider, status: "not_connected", quote: null };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race<DeliveryQuote | null>([
        quoteAdapter(request),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
      if (!result) return { provider, status: "unavailable", quote: null };
      if (result.provider !== provider || result.currency !== "GBP" ||
          !result.serviceable || !/^[A-Za-z0-9_-]{1,80}$/.test(result.quoteId) ||
          !Number.isSafeInteger(result.amountPence) || result.amountPence < 0 ||
          !Number.isSafeInteger(result.estimatedMinutes) ||
          result.estimatedMinutes < 1 ||
          result.estimatedMinutes > request.maximumDeliveryMinutes ||
          !Number.isFinite(Date.parse(result.expiresAt)) ||
          Date.parse(result.expiresAt) <= now ||
          Date.parse(result.expiresAt) > now + 30 * 60_000)
        return { provider, status: "invalid_quote", quote: null };
      return { provider, status: "quoted", quote: result };
    } catch {
      return { provider, status: "unavailable", quote: null };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }));
}

export type CheapestCourierDecision = {
  selected: DeliveryQuote | null;
  reason: "selected" | "no_verified_quote" | "order_not_ready" | "booking_already_requested";
  results: CourierQuoteResult[];
  bookingIntent: ReturnType<typeof planCourierBooking>["intent"];
};

/** Compare real enabled provider quotes only, at the point the paid order is
 * fully packed. Booking is a separate action protected by a persistent order
 * lock and an idempotency key: selecting a quote does not dispatch anyone.
 */
export async function chooseCheapestCourier(
  context: CourierBookingContext,
  request: CourierQuoteRequest,
  settings: readonly CourierProviderSetting[],
  adapters: Partial<Record<CourierProvider, CourierQuoteAdapter>>,
): Promise<CheapestCourierDecision> {
  if (context.fulfilment !== "delivery" || context.paymentStatus !== "paid" ||
      !context.allKitchenStationsReady)
    return { selected: null, reason: "order_not_ready", results: [], bookingIntent: null };
  if (context.alreadyBooked || context.existingBookingRequest)
    return { selected: null, reason: "booking_already_requested", results: [], bookingIntent: null };
  if (context.orderId !== request.orderId || context.locationId !== request.locationId ||
      context.tenantId !== request.tenantId || context.currency !== request.currency)
    return { selected: null, reason: "no_verified_quote", results: [], bookingIntent: null };
  const results = await collectCourierQuotes(request, settings, adapters);
  const validQuotes = results.flatMap((r) => r.status === "quoted" && r.quote ? [r.quote] : []);
  const decision = chooseDelivery(
    validQuotes, request.currency, request.requestedAt, request.maximumDeliveryMinutes,
  );
  if (!decision.selected) return {
    selected: null, reason: "no_verified_quote", results, bookingIntent: null,
  };
  const plan = planCourierBooking(context, validQuotes, request.requestedAt);
  return plan.allowed ? {
    selected: decision.selected, reason: "selected", results, bookingIntent: plan.intent,
  } : {
    selected: null, reason: "no_verified_quote", results, bookingIntent: null,
  };
}

/** Booking protocol for commissioned provider connectors. The reservation callback
 * MUST atomically persist a unique per-order request in the independent database
 * before any external booking or own-driver offer is attempted.
 * This deliberately never tries the second-cheapest courier after an uncertain call:
 * doing so could cause two drivers to collect the same order.
 */
export type CourierDispatchConfirmation =
  | { status: "booked"; providerBookingId: string }
  | { status: "uncertain" }
  | { status: "rejected" };
export type CourierDispatchOutcome =
  | { status: "not_ready"; provider: null }
  | { status: "locked"; provider: CourierProvider }
  | { status: "booked"; provider: CourierProvider; providerBookingId: string }
  | { status: "manual_review"; provider: CourierProvider };
export async function dispatchSelectedCourier(
  decision: CheapestCourierDecision,
  reserveOrderBooking: (intent: NonNullable<CheapestCourierDecision["bookingIntent"]>) => Promise<boolean>,
  book: (intent: NonNullable<CheapestCourierDecision["bookingIntent"]>) => Promise<CourierDispatchConfirmation>,
): Promise<CourierDispatchOutcome> {
  const intent = decision.bookingIntent;
  if (decision.reason !== "selected" || !decision.selected || !intent ||
      intent.provider !== decision.selected.provider ||
      intent.quoteId !== decision.selected.quoteId ||
      intent.amountPence !== decision.selected.amountPence)
    return { status: "not_ready", provider: null };
  // Reservation is the linearisation point across workers and browser retries.
  // A failure or uncertainty must stop here. Never book another provider.
  try {
    if (!await reserveOrderBooking(intent))
      return { status: "locked", provider: intent.provider };
  } catch {
    return { status: "manual_review", provider: intent.provider };
  }
  try {
    const confirmation = await book(intent);
    if (confirmation.status === "booked" &&
        /^[A-Za-z0-9_-]{1,120}$/.test(confirmation.providerBookingId))
      return { status: "booked", provider: intent.provider,
        providerBookingId: confirmation.providerBookingId };
    return { status: "manual_review", provider: intent.provider };
  } catch {
    return { status: "manual_review", provider: intent.provider };
  }
}
