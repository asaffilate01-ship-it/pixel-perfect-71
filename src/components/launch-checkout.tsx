import { usePublicMenu } from "@/components/menus/use-public-menu";
import { MilkcakeOfferTerms } from "@/components/menus/milkcake-offer-terms";
import {
  isMealDeckMilkcakePromotion,
  appliedMilkcakePromotion,
  milkcakeQuoteDisplayTotals,
  type AppliedMealDeckMilkcakePromotion,
} from "@/lib/mealdeck-milkcake-promotion";
import { useCustomerEntryPolicy } from "@/components/use-customer-entry-policy";
import { KERBSIDE_PARKING_INSTRUCTION } from "@/lib/mealdeck-customer-entry";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CarFront,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  MailCheck,
  MapPin,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { MealDeckLogo } from "./mealdeck-logo";
import { GroupPaymentChoice } from "./group-payments/payment-choice";
import { OrderNotificationsCard } from "./order-notifications-card";
import {
  sharedPaymentRoomPath,
  type SharedPaymentCapabilities,
  type SharedPaymentChoice,
} from "@/lib/mealdeck-shared-payments";
import {
  readSharedPaymentCapabilities,
  rememberSharedPaymentRoom,
  requestSharedPayment,
} from "@/lib/mealdeck-shared-payments-browser";
import {
  encodeLaunchPicks,
  findLaunchMenuItem,
  LAUNCH_PICKS_STORAGE_KEY,
  launchSelectionLabels,
  type LaunchMenuPick,
} from "@/lib/launch-menu-picks";
import {
  CHECKOUT_BASKET_HANDOFF_KEY,
  clearLaunchCheckoutTransfer,
  readLaunchCheckoutTransfer,
  readLaunchCheckoutPicks,
  type LaunchCheckoutGroup,
} from "@/lib/launch-basket-transfer";
import type { MealDeckPackingPlan } from "@/lib/mealdeck-checkout-selection";
import { formatPackingBagName } from "@/lib/mealdeck-packing-name";
import {
  formatLaunchMenuPrice,
  formatLaunchPromotionalPrice,
  launchMenuOfferBasketDisplayPrice,
} from "@/lib/launch-menu-display-prices";
import { launchCrossSelectionSummaries } from "@/lib/launch-menu-upsells";
import {
  getMealDeckCustomerAccessToken,
  initializeMealDeckCustomerClient,
  readMealDeckCustomerAccount,
  subscribeMealDeckCustomerAuth,
  type CustomerAccountState,
} from "@/lib/mealdeck-customer-browser";
import { parseKerbsideVehicle, type MealDeckOpeningOffer } from "@/lib/mealdeck-opening-offer";
import { customerOrderElapsedMinutes } from "@/lib/mealdeck-customer-order-timing";
import { orderDisplayNumber } from "@/lib/mealdeck-order-number";
import {
  MAX_ORDER_NOTES_LENGTH,
  ORDER_NOTES_ERROR_MESSAGE,
  normaliseOrderNotes,
  orderNotesMatch,
} from "@/lib/mealdeck-order-notes";
import { safeMealDeckCheckoutRedirect } from "@/lib/mealdeck-checkout-url";
import {
  CHECKOUT_MODE_KEY,
  checkoutModeForEntry,
  requestMealDeckAvailability,
  requestMealDeckCheckout,
  type MealDeckCheckoutMode,
} from "@/lib/mealdeck-checkout-browser";
import { notificationReceiptMode } from "@/lib/mealdeck-order-notifications-browser";
import {
  GUEST_PRIVACY_VERSION,
  normaliseGuestInput,
  parseGuestCheckoutState,
  type GuestCheckoutState,
} from "@/lib/mealdeck-guest";
import {
  kitchenAcceptsNewOrders,
  parseKitchenAvailability,
  type KitchenAvailability,
} from "@/lib/mealdeck-kitchen-availability";
import {
  requestWhatsAppCheckout,
  matchingWhatsAppReceiptContext,
  readWhatsAppPaymentAttempt,
  rememberWhatsAppPaymentAttempt,
  whatsAppCheckoutStorageKey,
  whatsAppDraftBagQuantities,
  whatsAppGuestContactMatches,
  whatsAppPaymentRecovery,
  whatsAppQuoteInput,
  type WhatsAppCheckoutContext,
  type WhatsAppPaymentAttempt,
} from "@/lib/mealdeck-whatsapp-checkout-browser";

const FULFILMENT_KEY = "mealdeck-checkout-fulfilment-v1";
const ATTEMPT_KEY = "mealdeck-checkout-attempt-v2";
type Fulfilment = "pickup" | "curbside";
type PricedLine = {
  lineId: string;
  parentLineId: string | null;
  name: string;
  quantity: number;
  base_unit_pence: number;
  unit_pence: number;
  line_pence: number;
  promotion?: AppliedMealDeckMilkcakePromotion;
  modifiers: {
    group_name: string;
    name: string;
    quantity_per_parent?: number;
    price_delta_pence: number;
    kind: string;
    target_brand_name: string | null;
    target_description: string | null;
  }[];
  attachment: string | null;
};
type Quote = {
  quoteId: string;
  expiresAt: string;
  grossPence: number;
  discountPence: number;
  totalPence: number;
  collectionEstimateMinutes: number;
  lines: PricedLine[];
  openingOffer: MealDeckOpeningOffer;
  packingPlan: MealDeckPackingPlan;
  notes?: string | null;
};
type Receipt = {
  orderId: string;
  quoteId: string;
  status: string;
  paymentStatus: string;
  verifiedPaid: boolean;
  orderNumber?: string | null;
  handoffCode: string | null;
  fulfilment: Fulfilment;
  createdAt: string;
  paidAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyForCollectionAt: string | null;
  completedAt: string | null;
  estimatedReadyAt: string | null;
  serverNow: string;
  collectionEstimateMinutes: number;
  grossPence: number;
  discountPence: number;
  totalPence: number;
  lines: PricedLine[];
  passStatus: string | null;
  held: boolean;
  paymentSessionExpired: boolean;
  packingPlan: MealDeckPackingPlan;
  notes?: string | null;
};
type CheckoutStatus = {
  available: boolean;
  prelaunchVerification?: boolean;
  openingOffer: MealDeckOpeningOffer;
  guestCheckout: GuestCheckoutState;
  kitchen: KitchenAvailability | null;
};
type ApiResult = {
  quote?: Quote;
  receipt?: Receipt;
  checkoutUrl?: string;
  orderId?: string;
  message?: string;
  error?: string;
  guestCheckout?: GuestCheckoutState;
};

function clock(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "";
}
async function checkoutRequest(
  mode: MealDeckCheckoutMode,
  input: Record<string, unknown>,
  signal?: AbortSignal,
  whatsApp = false,
): Promise<ApiResult> {
  return requestMealDeckCheckout<ApiResult>(
    mode,
    input,
    getMealDeckCustomerAccessToken,
    signal,
    fetch,
    whatsApp ? { source: "whatsapp" } : undefined,
  );
}

function KitchenAvailabilityNotice({
  status,
  current,
  available,
}: {
  status: CheckoutStatus | null;
  current: boolean;
  available: boolean;
}) {
  if (!status || (current && available && status.kitchen?.state !== "busy")) return null;
  const kitchen = status.kitchen;
  let tone = "unavailable";
  let heading = "Ordering is currently unavailable";
  let message = "You can still browse the menus and prepare your basket.";
  if (!current) {
    heading = "We can't confirm ordering availability";
    message = "Check your connection to see the latest availability.";
  } else if (kitchen?.state === "paused") {
    tone = "paused";
    heading = "Ordering is temporarily paused";
    message =
      "We're not accepting new orders right now. You can still browse and keep your basket for later.";
  } else if (kitchen?.state === "closed") {
    tone = "closed";
    heading = "The Luton kitchen is closed";
    message =
      "We're not accepting new orders right now. You can still browse and keep your basket for later.";
  } else if (available && kitchen?.state === "busy") {
    tone = "busy";
    heading = "We're busy";
    message =
      kitchen.collectionEstimateMinutes === null
        ? "Your pickup estimate will be confirmed before payment."
        : `Current pickup estimate for new orders: about ${kitchen.collectionEstimateMinutes} minutes after payment.`;
  }
  return (
    <section
      className={`md-checkout-kitchen-notice is-${tone}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Clock3 size={23} aria-hidden="true" />
      <div>
        <p className="md-checkout-kitchen-label">Luton · New orders</p>
        <h2>{heading}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

export function DetailedOrderLines({
  lines,
  packingPlan,
}: {
  lines: PricedLine[];
  packingPlan: MealDeckPackingPlan;
}) {
  const promotion = appliedMilkcakePromotion(lines);
  const offerBagNumber = promotion
    ? Math.min(
        ...packingPlan.bags
          .filter((bag) =>
            bag.allocations.some(
              (allocation) => allocation.lineId === promotion.lineId && allocation.quantity > 0,
            ),
          )
          .map((bag) => bag.number),
      )
    : null;
  return (
    <div className="md-checkout-itemised">
      <p className="md-checkout-packing-label">
        <PackageCheck size={16} />
        {packingPlan.separateBags ? "Separate numbered bags" : "Pack together"} ·{" "}
        {packingPlan.cutleryRequested ? "Cutlery requested" : "No cutlery requested"}
      </p>
      {packingPlan.bags.map((bag) => (
        <section
          className="md-checkout-bag"
          key={bag.number}
          aria-label={formatPackingBagName(bag)}
        >
          <h3>{formatPackingBagName(bag)}</h3>
          <ul>
            {bag.allocations.map((allocation) => {
              const line = lines.find((item) => item.lineId === allocation.lineId);
              if (!line) return null;
              const parent = line.parentLineId
                ? lines.find((item) => item.lineId === line.parentLineId)
                : null;
              const offerQuantity =
                promotion?.lineId === line.lineId && offerBagNumber === bag.number ? 1 : 0;
              const displayLinePence =
                line.unit_pence * allocation.quantity - (offerQuantity ? 300 : 0);
              return (
                <li key={allocation.lineId} className={parent ? "md-checkout-linked-extra" : ""}>
                  <div className="md-checkout-line-detail">
                    <div className="md-checkout-line-heading">
                      <strong>
                        {allocation.quantity} × {line.name}
                      </strong>
                      <span>
                        {formatLaunchPromotionalPrice(
                          displayLinePence,
                          offerQuantity ? line.promotion : undefined,
                        )}
                      </span>
                    </div>
                    {parent && <small>Extra with {parent.name}</small>}
                    {offerQuantity === 1 && (
                      <p className="md-checkout-offer">
                        <MilkcakeOfferTerms explained />
                      </p>
                    )}
                    <dl className="md-checkout-choice-list">
                      {offerQuantity === 1 ? (
                        <>
                          <div>
                            <dt>
                              1 milkcake · offer included
                              {line.modifiers.length ? ", with choices" : ""}
                            </dt>
                            <dd>
                              {formatLaunchPromotionalPrice(line.unit_pence - 300, line.promotion)}
                            </dd>
                          </div>
                          {allocation.quantity > 1 && (
                            <div>
                              <dt>
                                {allocation.quantity - 1} additional milkcake
                                {allocation.quantity > 2 ? "s" : ""} · before 30% off
                              </dt>
                              <dd>
                                {formatLaunchMenuPrice(line.unit_pence * (allocation.quantity - 1))}
                              </dd>
                            </div>
                          )}
                        </>
                      ) : (
                        <div>
                          <dt>{line.modifiers.length ? "Each, including choices" : "Each"}</dt>
                          <dd>{formatLaunchMenuPrice(line.unit_pence)}</dd>
                        </div>
                      )}
                      {line.modifiers.map((modifier, index) => (
                        <div key={index}>
                          <dt>
                            <span>{modifier.group_name}</span>
                            {allocation.quantity * (modifier.quantity_per_parent ?? 1)} ×{" "}
                            {modifier.target_brand_name ? modifier.target_brand_name + " · " : ""}
                            {modifier.name}
                            {modifier.target_description && (
                              <small>{modifier.target_description}</small>
                            )}
                          </dt>
                          <dd>Included</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ReceiptProgress({ receipt }: { receipt: Receipt }) {
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    const observed = performance.now();
    const tick = () =>
      setElapsed(
        customerOrderElapsedMinutes(
          receipt.paidAt,
          receipt.serverNow,
          performance.now() - observed,
        ),
      );
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [receipt.paidAt, receipt.serverNow]);
  const stages = [
    { label: "Placed", at: receipt.paidAt },
    { label: "Accepted", at: receipt.acceptedAt },
    { label: "Preparing", at: receipt.preparingAt },
    { label: "Ready", at: receipt.readyForCollectionAt },
    { label: "Completed", at: receipt.completedAt },
  ];
  const count = stages.filter((stage) => stage.at).length;
  return (
    <section className="md-checkout-progress" aria-label="Order progress">
      <div className="md-checkout-progress-heading">
        <h2>Your order, live</h2>
        <span>
          {receipt.completedAt
            ? "Completed"
            : elapsed === null
              ? "Updating order time"
              : elapsed === 0
                ? "Just placed"
                : elapsed + " min since ordering"}
        </span>
      </div>
      <div
        className="md-checkout-progress-bar"
        role="progressbar"
        aria-label="Order progress"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={count}
        aria-valuetext={stages[Math.max(0, count - 1)]?.label}
      >
        <span style={{ width: `${count * 20}%` }} />
      </div>
      <ol>
        {stages.map((stage) => (
          <li key={stage.label} className={stage.at ? "is-complete" : ""}>
            <span aria-hidden="true">
              {stage.at ? <Check size={15} /> : <span className="md-checkout-dot" />}
            </span>
            <strong>{stage.label}</strong>
            <small>{stage.at ? clock(stage.at) : "Waiting"}</small>
          </li>
        ))}
      </ol>
      <p>
        {receipt.completedAt
          ? "Thanks for ordering with MealDeck. Enjoy your food."
          : receipt.readyForCollectionAt
            ? "Your complete order is packed and ready. Give your collection code to the team at handover."
            : receipt.preparingAt
              ? "The kitchen is preparing your brands together for one collection."
              : receipt.acceptedAt
                ? "The kitchen has accepted your order. We'll update this page as it progresses."
                : "Payment confirmed. Your order is with the kitchen, awaiting acceptance."}
      </p>
    </section>
  );
}

export function CheckoutPriceSummary({
  total,
}: {
  total: Pick<Quote, "grossPence" | "discountPence" | "totalPence" | "lines">;
}) {
  const display = milkcakeQuoteDisplayTotals(total);
  const hasMilkcakeOffer = !!display.promotion;
  return (
    <dl className="md-checkout-totals">
      <div>
        <dt>Items & upgrades</dt>
        <dd>{formatLaunchPromotionalPrice(display.itemsSubtotalPence, display.promotion)}</dd>
      </div>
      {display.openingDiscountPence > 0 && (
        <div className="md-checkout-discount">
          <dt>{hasMilkcakeOffer ? "30% off other items & extras" : "Opening weekend · 30% off"}</dt>
          <dd>−{formatLaunchMenuPrice(display.openingDiscountPence)}</dd>
        </div>
      )}
      {hasMilkcakeOffer && (
        <div>
          <dt>One 99p milkcake</dt>
          <dd>Discount included</dd>
        </div>
      )}
      <div>
        <dt>Collection / kerbside pickup</dt>
        <dd>Free</dd>
      </div>
      <div className="md-checkout-total">
        <dt>Total</dt>
        <dd>{formatLaunchMenuPrice(total.totalPence)}</dd>
      </div>
    </dl>
  );
}

export function CheckoutActionFeedback({
  issue,
  paymentPending,
}: {
  issue: string | null;
  paymentPending: boolean;
}) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!issue || !errorRef.current) return;
    errorRef.current.focus({ preventScroll: true });
    errorRef.current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "nearest",
    });
  }, [issue]);
  if (issue)
    return (
      <p
        ref={errorRef}
        className="md-checkout-notice md-checkout-error md-checkout-action-feedback"
        role="alert"
        tabIndex={-1}
      >
        {issue}
      </p>
    );
  if (paymentPending)
    return (
      <p className="md-checkout-action-feedback md-checkout-muted" role="status">
        Keep this page open while we connect to secure checkout.
      </p>
    );
  return null;
}

export function CheckoutSpecialRequests({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  let invalid = false;
  try {
    normaliseOrderNotes(value);
  } catch {
    invalid = true;
  }
  const characters = [...value.replace(/\r\n?/g, "\n").trim()].length;
  return (
    <div className="md-checkout-special-requests">
      <label htmlFor={id}>
        Special requests <span>(optional)</span>
      </label>
      <textarea
        id={id}
        value={value}
        rows={3}
        maxLength={MAX_ORDER_NOTES_LENGTH * 2}
        disabled={disabled}
        placeholder="No onions; sauce separately"
        aria-invalid={invalid}
        aria-describedby={`${id}-help ${id}-count${invalid ? ` ${id}-error` : ""}`}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="md-checkout-request-help">
        <p id={`${id}-help`}>Choose extra items and paid add-ons from the menu.</p>
        <p id={`${id}-count`} className="md-checkout-request-count">
          {characters} / {MAX_ORDER_NOTES_LENGTH}
          <span className="sr-only"> characters</span>
        </p>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="md-checkout-request-error" role="alert">
          {ORDER_NOTES_ERROR_MESSAGE}
        </p>
      )}
    </div>
  );
}

/** Review only saved server instructions, never an unsaved local draft. */
export function CheckoutSpecialRequestsReview({ notes }: { notes?: string | null }) {
  if (!notes) return null;
  return (
    <section className="md-checkout-saved-requests" aria-label="Special requests">
      <h3>Special requests</h3>
      <p>{notes}</p>
    </section>
  );
}

type LaunchCheckoutProps = {
  orderId?: string;
  notificationMode?: MealDeckCheckoutMode;
  cancelled?: boolean;
  groupExpected?: boolean;
  whatsAppCheckout?: WhatsAppCheckoutContext;
};

/** Stripe keeps its canonical /checkout?order return. Only this exact bound order restores chat context. */
export function LaunchCheckout(props: LaunchCheckoutProps) {
  const [recovered, setRecovered] = useState<{
    orderId: string;
    context: WhatsAppCheckoutContext | null;
  } | null>(null);
  useEffect(() => {
    if (!props.orderId || props.whatsAppCheckout) return;
    const expected = props.orderId;
    let mounted = true;
    let settled = false;
    const controller = new AbortController();
    const complete = (context: WhatsAppCheckoutContext | null) => {
      if (!mounted || settled) return;
      settled = true;
      clearTimeout(timer);
      setRecovered({ orderId: expected, context });
    };
    // An optional channel outage must never block an ordinary order receipt.
    const timer = setTimeout(() => {
      complete(null);
      controller.abort();
    }, 2_000);
    void requestWhatsAppCheckout({ action: "current" }, fetch, { signal: controller.signal })
      .then((context) => complete(matchingWhatsAppReceiptContext(context, expected)))
      .catch(() => complete(null));
    return () => {
      mounted = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [props.orderId, props.whatsAppCheckout]);
  if (props.orderId && !props.whatsAppCheckout && recovered?.orderId !== props.orderId)
    return (
      <div className="md-checkout-shell">
        <SiteHeader />
        <main className="md-checkout" id="main-content">
          <section className="md-checkout-card" role="status">
            <Loader2 className="md-checkout-spin" aria-hidden="true" />
            <h1>Checking private order access</h1>
            <p>Restoring the checkout used for this order…</p>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  const context =
    props.whatsAppCheckout ?? (recovered?.orderId === props.orderId ? recovered?.context : null);
  return (
    <LaunchCheckoutView
      key={
        (context?.handoffId ?? "website") +
        ":" +
        (props.orderId ?? "new") +
        ":" +
        (props.notificationMode ?? "saved")
      }
      {...props}
      {...(context ? { whatsAppCheckout: context } : {})}
    />
  );
}

function LaunchCheckoutView({
  orderId,
  notificationMode,
  cancelled = false,
  groupExpected = false,
  whatsAppCheckout,
}: LaunchCheckoutProps) {
  // The push link chooses the receipt's existing identity transport only.
  // It never supplies a guest token, grants access or changes checkout eligibility.
  const receiptMode = notificationReceiptMode(orderId, notificationMode);
  const whatsAppDraft = whatsAppCheckout?.draft;
  const [whatsAppBoundMode, setWhatsAppBoundMode] = useState<MealDeckCheckoutMode | null>(
    whatsAppCheckout?.quoteId ? whatsAppCheckout.checkoutMode : null,
  );
  const checkoutHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (whatsAppDraft) checkoutHeading.current?.focus();
  }, [whatsAppDraft]);
  const checkoutModeKey = whatsAppCheckout
    ? whatsAppCheckoutStorageKey(whatsAppCheckout.handoffId, "mode")
    : CHECKOUT_MODE_KEY;
  const [whatsAppPrivacyAcknowledged, setWhatsAppPrivacyAcknowledged] = useState(false);
  const [whatsAppPaymentAttempt, setWhatsAppPaymentAttempt] =
    useState<WhatsAppPaymentAttempt | null>(() => {
      if (!whatsAppCheckout) return null;
      if (whatsAppCheckout.quoteId && whatsAppCheckout.attemptId && whatsAppCheckout.checkoutMode)
        return {
          quoteId: whatsAppCheckout.quoteId,
          attemptId: whatsAppCheckout.attemptId,
          checkoutMode: whatsAppCheckout.checkoutMode,
          ...(whatsAppCheckout.orderId ? { orderId: whatsAppCheckout.orderId } : {}),
        };
      try {
        return readWhatsAppPaymentAttempt(sessionStorage, whatsAppCheckout.handoffId);
      } catch {
        return null;
      }
    });
  const entryPolicy = useCustomerEntryPolicy();
  const modeChosen = useRef(false);
  const [picks, setPicks] = useState<LaunchMenuPick[]>([]);
  const [basketLoaded, setBasketLoaded] = useState(false);
  const [fulfilment, setFulfilment] = useState<Fulfilment | null>(null);
  const [vehicle, setVehicle] = useState({ make: "", registrationLast4: "", colour: "" });
  const [account, setAccount] = useState<CustomerAccountState | null>(null);
  const [accountIssue, setAccountIssue] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [statusCurrent, setStatusCurrent] = useState(false);
  const [selectedCheckoutMode, setCheckoutMode] = useState<MealDeckCheckoutMode>(
    whatsAppCheckout?.checkoutMode ??
      whatsAppPaymentAttempt?.checkoutMode ??
      receiptMode ??
      (orderId ? "member" : "guest"),
  );
  const [guestDetails, setGuestDetails] = useState({
    name: whatsAppDraft?.customer.name ?? "",
    email: "",
    phone: whatsAppDraft?.customer.phone ?? "",
  });
  useEffect(() => {
    if (
      !entryPolicy ||
      orderId ||
      whatsAppBoundMode ||
      whatsAppPaymentAttempt ||
      modeChosen.current
    )
      return;
    try {
      const saved = sessionStorage.getItem(checkoutModeKey);
      if (saved === "member" || saved === "guest") {
        setCheckoutMode(saved);
        modeChosen.current = true;
        return;
      }
    } catch {
      /* No stored choice. */
    }
    setCheckoutMode(entryPolicy.emailRegistrationDeferred ? "guest" : "member");
  }, [entryPolicy, orderId, checkoutModeKey, whatsAppPaymentAttempt, whatsAppBoundMode]);
  const [guestIssue, setGuestIssue] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [deliveryNotice, setDeliveryNotice] = useState(false);
  const [cutleryRequested, setCutleryRequested] = useState(false);
  const [specialRequests, setSpecialRequests] = useState("");
  const [separateBags, setSeparateBags] = useState(false);
  const [bagCount, setBagCount] = useState(1);
  const [bagQuantities, setBagQuantities] = useState<Record<string, number[]>>({});
  const [groupCheckout, setGroupCheckout] = useState<LaunchCheckoutGroup | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<SharedPaymentChoice>("host");
  const [sharedCapabilities, setSharedCapabilities] = useState<SharedPaymentCapabilities | null>(
    null,
  );
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedRefresh, setSharedRefresh] = useState(0);
  const [basketIssue, setBasketIssue] = useState<string | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [receiptRefreshed, setReceiptRefreshed] = useState(false);
  const attempt = useRef<{ quoteId: string; attemptId: string } | null>(null);
  const roomAttempt = useRef<{ key: string; attemptId: string } | null>(null);
  const alive = useRef(true);
  const receiptRequest = useRef(0);
  const receiptInFlight = useRef(false);
  const checkoutRequestId = useRef(0);
  const statusRequestId = useRef(0);
  const guestStateVersion = useRef(0);
  const registered = account?.status === "signed_in" && account.profile.registered;
  const checkoutMode = checkoutModeForEntry(selectedCheckoutMode, {
    hasOrder: !!orderId || !!whatsAppPaymentAttempt || !!whatsAppBoundMode,
    registrationDeferred: entryPolicy?.emailRegistrationDeferred,
    registered,
  });
  const memberEntryVisible = entryPolicy?.emailRegistrationDeferred === false || registered;
  useEffect(() => {
    if (orderId || whatsAppPaymentAttempt || whatsAppBoundMode) return;
    if (registered && status?.prelaunchVerification) setCheckoutMode("member");
    else if (!memberEntryVisible) setCheckoutMode("guest");
  }, [
    orderId,
    registered,
    status?.prelaunchVerification,
    memberEntryVisible,
    whatsAppPaymentAttempt,
    whatsAppBoundMode,
  ]);
  const guestSession = status?.guestCheckout.session ?? null;
  const whatsAppGuestMismatch = Boolean(
    whatsAppDraft && guestSession && !whatsAppGuestContactMatches(whatsAppDraft, guestSession),
  );
  const pickupContact =
    checkoutMode === "guest"
      ? guestSession
      : account?.status === "signed_in" && registered
        ? account.profile
        : null;
  useEffect(() => {
    setReviewConfirmed(false);
  }, [pickupContact?.name, pickupContact?.phone]);
  const orderingAvailable =
    status?.available === true &&
    status.kitchen !== null &&
    kitchenAcceptsNewOrders(status.kitchen.state) &&
    status.kitchen.collectionEstimateMinutes !== null;
  const guestEligible = orderingAvailable && status?.guestCheckout.eligible === true;
  const canViewReceipt = checkoutMode === "guest" ? Boolean(guestSession) : registered;
  const canCheckout =
    !whatsAppCheckout?.paused &&
    !basketIssue &&
    picks.length > 0 &&
    orderingAvailable &&
    canViewReceipt &&
    (orderId ||
      !whatsAppDraft ||
      checkoutMode !== "guest" ||
      (whatsAppPrivacyAcknowledged && !whatsAppGuestMismatch)) &&
    (checkoutMode === "member" || guestEligible);
  const customerIdentity =
    checkoutMode === "guest"
      ? "guest:" + (guestSession?.id ?? "new")
      : "member:" + (account?.status === "signed_in" ? account.profile.userId : "signed-out");
  const publicMenu = usePublicMenu();
  const { catalogue } = publicMenu;
  const basketPrice = launchMenuOfferBasketDisplayPrice(picks, catalogue);
  const displayTotal = basketPrice.itemsSubtotalPence;
  const hasMilkcakeOffer = quote
    ? !!appliedMilkcakePromotion(quote.lines)
    : basketPrice.hasMilkcakeOffer;
  const accountReturnTo = whatsAppCheckout
    ? "/whatsapp/checkout"
    : !orderId && (groupExpected || groupCheckout)
      ? "/checkout?group=1"
      : "/checkout";
  const sharedAvailable =
    sharedCapabilities?.available === true &&
    (checkoutMode !== "guest" || sharedCapabilities.guestEligible);
  const sharedReady =
    sharedAvailable && !sharedLoading && separateBags && bagCount >= 2 && bagCount <= 10;

  useEffect(() => {
    if (!groupCheckout?.groupId || orderId) return;
    const controller = new AbortController();
    setSharedLoading(true);
    void readSharedPaymentCapabilities(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSharedCapabilities(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSharedCapabilities({
            available: false,
            guestEligible: false,
            message:
              "Shared payment setup is unavailable. You can choose one payer when checkout is open.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setSharedLoading(false);
      });
    return () => controller.abort();
  }, [groupCheckout?.groupId, orderId, orderingAvailable, sharedRefresh]);

  useEffect(() => {
    if (whatsAppDraft) {
      setPicks(whatsAppDraft.picks);
      setFulfilment(whatsAppDraft.fulfilment);
      setVehicle(whatsAppDraft.vehicle ?? { make: "", colour: "", registrationLast4: "" });
      setSpecialRequests(whatsAppDraft.notes);
      setCutleryRequested(whatsAppDraft.packingPlan.cutleryRequested);
      setSeparateBags(whatsAppDraft.packingPlan.separateBags);
      setBagCount(whatsAppDraft.packingPlan.bagCount);
      setBagQuantities(whatsAppDraftBagQuantities(whatsAppDraft));
      setBasketLoaded(true);
      return;
    }
    const transfer = readLaunchCheckoutTransfer(groupExpected);
    const savedPicks = transfer.picks;
    const savedGroup = transfer.group;
    setPicks(savedPicks);
    setBasketIssue(transfer.issue);
    setQuote(null);
    setReviewConfirmed(false);
    setSpecialRequests("");
    attempt.current = null;
    setBasketLoaded(true);
    setGroupCheckout(savedGroup);
    setPaymentChoice("host");
    roomAttempt.current = null;
    setSeparateBags(!!savedGroup);
    setBagCount(savedGroup?.packing.bagCount ?? 1);
    setBagQuantities(
      Object.fromEntries(
        savedPicks.map((pick, index) => [
          "line-" + (index + 1),
          savedGroup
            ? Array.from(
                { length: savedGroup.packing.bagCount },
                (_, bag) =>
                  savedGroup.packing.allocations.find(
                    (entry) => entry.lineId === "line-" + (index + 1) && entry.bag === bag + 1,
                  )?.quantity ?? 0,
              )
            : [pick.quantity],
        ]),
      ),
    );
  }, [groupExpected, whatsAppDraft]);

  useEffect(() => {
    try {
      if (!whatsAppDraft) {
        const saved = sessionStorage.getItem(FULFILMENT_KEY);
        if (saved === "pickup" || saved === "curbside") setFulfilment(saved);
      }
      if (
        !receiptMode &&
        !whatsAppCheckout?.checkoutMode &&
        !whatsAppPaymentAttempt &&
        sessionStorage.getItem(checkoutModeKey) === "guest"
      )
        setCheckoutMode("guest");
    } catch {
      /* Optional restoration. */
    }
  }, [
    checkoutModeKey,
    receiptMode,
    whatsAppCheckout?.checkoutMode,
    whatsAppDraft,
    whatsAppPaymentAttempt,
  ]);

  useEffect(() => {
    alive.current = true;
    let unsubscribe: (() => void) | undefined;
    const refreshAccount = async () => {
      try {
        await initializeMealDeckCustomerClient();
        const result = await readMealDeckCustomerAccount();
        if (alive.current) {
          setAccount(result);
          setAccountIssue(null);
        }
      } catch (error) {
        if (alive.current)
          setAccountIssue(
            error instanceof Error ? error.message : "Please reconnect to your account.",
          );
      }
    };
    void refreshAccount().then(() => {
      if (!alive.current) return;
      try {
        unsubscribe = subscribeMealDeckCustomerAuth(() => {
          statusRequestId.current += 1;
          setStatusCurrent(false);
          void refreshAccount().then(refreshStatus);
        });
      } catch {
        /* Unconfigured accounts display a retry. */
      }
    });
    const controller = new AbortController();
    const refreshStatus = () => {
      if (document.visibilityState === "hidden") return;
      const requestId = ++statusRequestId.current;
      const guestVersion = guestStateVersion.current;
      void requestMealDeckAvailability(
        "/api/checkout",
        getMealDeckCustomerAccessToken,
        controller.signal,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("Checkout status unavailable.");
          return (await response.json()) as CheckoutStatus;
        })
        .then((data) => {
          if (
            alive.current &&
            !controller.signal.aborted &&
            requestId === statusRequestId.current &&
            guestVersion === guestStateVersion.current
          ) {
            setStatus({
              ...data,
              available: data.available === true,
              kitchen: parseKitchenAvailability(data.kitchen),
              guestCheckout: parseGuestCheckoutState(data.guestCheckout) ?? {
                eligible: false,
                session: null,
              },
            });
            setStatusCurrent(true);
          }
        })
        .catch(() => {
          if (
            alive.current &&
            !controller.signal.aborted &&
            requestId === statusRequestId.current &&
            guestVersion === guestStateVersion.current
          ) {
            setStatus((current) => ({
              available: false,
              kitchen: current?.kitchen ?? null,
              guestCheckout: { eligible: false, session: current?.guestCheckout.session ?? null },
              openingOffer: current?.openingOffer ?? {
                status: "unscheduled",
                startsAt: null,
                endsAt: null,
                timezone: "Europe/London",
                serverNow: new Date().toISOString(),
              },
            }));
            setStatusCurrent(false);
          }
        });
    };
    refreshStatus();
    const statusTimer = setInterval(refreshStatus, 30_000);
    document.addEventListener("visibilitychange", refreshStatus);
    window.addEventListener("online", refreshStatus);
    return () => {
      alive.current = false;
      checkoutRequestId.current += 1;
      unsubscribe?.();
      controller.abort();
      clearInterval(statusTimer);
      document.removeEventListener("visibilitychange", refreshStatus);
      window.removeEventListener("online", refreshStatus);
    };
  }, []);

  useEffect(() => {
    // A second customer using this device must never see the previous account's
    // receipt, final quote or pending request response.
    receiptRequest.current += 1;
    receiptInFlight.current = false;
    checkoutRequestId.current += 1;
    setBusy(false);
    setPaymentPending(false);
    setReceipt(null);
    setReceiptRefreshed(false);
    setQuote(null);
    setReviewConfirmed(false);
    setSpecialRequests(whatsAppDraft?.notes ?? "");
    setIssue(null);
    attempt.current = null;
  }, [customerIdentity, orderId, whatsAppDraft]);

  const refreshReceipt = useCallback(
    async (signal?: AbortSignal) => {
      if (!orderId || receiptInFlight.current) return;
      receiptInFlight.current = true;
      const requestId = ++receiptRequest.current;
      try {
        const result = await checkoutRequest(checkoutMode, { action: "receipt", orderId }, signal);
        if (
          alive.current &&
          requestId === receiptRequest.current &&
          !signal?.aborted &&
          result.receipt
        ) {
          setReceipt(result.receipt);
          setReceiptRefreshed(true);
          setIssue(null);
        }
      } catch (error) {
        if (alive.current && requestId === receiptRequest.current && !signal?.aborted) {
          setIssue(error instanceof Error ? error.message : "We couldn't refresh your order.");
          setReceiptRefreshed(true);
        }
      } finally {
        if (requestId === receiptRequest.current) receiptInFlight.current = false;
      }
    },
    [orderId, checkoutMode],
  );

  useEffect(() => {
    if (
      !orderId ||
      !canViewReceipt ||
      receipt?.completedAt ||
      receipt?.paymentStatus === "refunded"
    )
      return;
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine)
        void refreshReceipt(controller.signal);
    };
    refresh();
    const timer = setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [
    orderId,
    canViewReceipt,
    customerIdentity,
    receipt?.completedAt,
    receipt?.paymentStatus,
    refreshReceipt,
  ]);

  useEffect(() => {
    if (!receipt?.verifiedPaid) return;
    if (whatsAppCheckout) {
      try {
        const saved = readWhatsAppPaymentAttempt(sessionStorage, whatsAppCheckout.handoffId);
        if (saved?.orderId === receipt.orderId)
          sessionStorage.removeItem(whatsAppCheckoutStorageKey(whatsAppCheckout.handoffId));
      } catch {
        /* The verified receipt remains available. */
      }
      return;
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "null") as {
        orderId?: string;
        basket?: string;
        preserveSavedBasket?: boolean;
      } | null;
      if (saved?.orderId === receipt.orderId && saved.basket) {
        // An older paid order must not remove a newer basket prepared on this
        // device while payment was in progress.
        const clearTransfer = encodeLaunchPicks(readLaunchCheckoutPicks()) === saved.basket;
        try {
          if (
            !saved.preserveSavedBasket &&
            localStorage.getItem(LAUNCH_PICKS_STORAGE_KEY) === saved.basket
          )
            localStorage.removeItem(LAUNCH_PICKS_STORAGE_KEY);
        } catch {
          /* Session transfer can still be cleared if persistent storage is blocked. */
        }
        if (sessionStorage.getItem(CHECKOUT_BASKET_HANDOFF_KEY) === saved.basket)
          sessionStorage.removeItem(CHECKOUT_BASKET_HANDOFF_KEY);
        sessionStorage.removeItem(ATTEMPT_KEY);
        sessionStorage.removeItem(FULFILMENT_KEY);
        if (clearTransfer) clearLaunchCheckoutTransfer();
      }
    } catch {
      /* Never lose the confirmed receipt because local storage is unavailable. */
    }
  }, [receipt, whatsAppCheckout]);

  function chooseCheckoutMode(next: MealDeckCheckoutMode) {
    if (whatsAppBoundMode && next !== whatsAppBoundMode) return;
    if (whatsAppPaymentAttempt && next !== whatsAppPaymentAttempt.checkoutMode) return;
    modeChosen.current = true;
    if (next === checkoutMode) return;
    checkoutRequestId.current += 1;
    receiptRequest.current += 1;
    receiptInFlight.current = false;
    setCheckoutMode(next);
    setBusy(false);
    setQuote(null);
    setReceipt(null);
    setReceiptRefreshed(false);
    setReviewConfirmed(false);
    setSpecialRequests(whatsAppDraft?.notes ?? "");
    setWhatsAppPrivacyAcknowledged(false);
    attempt.current = null;
    setIssue(null);
    setGuestIssue(null);
    try {
      sessionStorage.setItem(checkoutModeKey, next);
    } catch {
      /* The selection still applies to this screen. */
    }
  }
  async function saveGuestDetails() {
    if (busy || !guestEligible) return;
    if (whatsAppDraft && !whatsAppPrivacyAcknowledged) {
      setGuestIssue("Please acknowledge the Privacy Notice before saving your guest details.");
      return;
    }
    setGuestIssue(null);
    let contact: ReturnType<typeof normaliseGuestInput>;
    try {
      contact = normaliseGuestInput({
        action: "guest",
        ...guestDetails,
        ...(whatsAppDraft ? whatsAppDraft.customer : {}),
        privacyVersion: GUEST_PRIVACY_VERSION,
      });
    } catch (error) {
      setGuestIssue(error instanceof Error ? error.message : "Please check your contact details.");
      return;
    }
    const requestId = ++checkoutRequestId.current;
    guestStateVersion.current += 1;
    setBusy(true);
    try {
      const result = await checkoutRequest("guest", {
        action: "guest",
        ...contact,
        privacyVersion: GUEST_PRIVACY_VERSION,
      });
      const next = parseGuestCheckoutState(result.guestCheckout);
      if (!next?.session) throw new Error("We couldn't save your guest details. Please try again.");
      if (alive.current && requestId === checkoutRequestId.current) {
        setGuestDetails({ ...contact, email: contact.email ?? "" });
        setStatus((current) => (current ? { ...current, guestCheckout: next } : current));
      }
    } catch (error) {
      if (alive.current && requestId === checkoutRequestId.current)
        setGuestIssue(
          error instanceof Error ? error.message : "We couldn't save your guest details.",
        );
    } finally {
      guestStateVersion.current += 1;
      if (alive.current && requestId === checkoutRequestId.current) setBusy(false);
    }
  }
  async function endGuestSession() {
    if (busy) return;
    const requestId = ++checkoutRequestId.current;
    guestStateVersion.current += 1;
    setBusy(true);
    setGuestIssue(null);
    try {
      await checkoutRequest("guest", { action: "end_guest" });
      if (alive.current && requestId === checkoutRequestId.current) {
        setStatus((current) =>
          current
            ? { ...current, guestCheckout: { ...current.guestCheckout, session: null } }
            : current,
        );
        setGuestDetails({
          name: whatsAppDraft?.customer.name ?? "",
          email: "",
          phone: whatsAppDraft?.customer.phone ?? "",
        });
        setWhatsAppPrivacyAcknowledged(false);
      }
    } catch (error) {
      if (alive.current && requestId === checkoutRequestId.current)
        setGuestIssue(
          error instanceof Error ? error.message : "We couldn't end your guest session.",
        );
    } finally {
      guestStateVersion.current += 1;
      if (alive.current && requestId === checkoutRequestId.current) setBusy(false);
    }
  }
  function chooseFulfilment(next: Fulfilment) {
    if (whatsAppDraft) return;
    setFulfilment(next);
    setQuote(null);
    setReviewConfirmed(false);
    setIssue(null);
    setDeliveryNotice(false);
    try {
      sessionStorage.setItem(FULFILMENT_KEY, next);
    } catch {
      /* Current-screen selection still works. */
    }
  }
  function updateBagCount(count: number) {
    if (whatsAppDraft) return;
    setBagCount(count);
    setQuote(null);
    setReviewConfirmed(false);
    setBagQuantities((current) =>
      Object.fromEntries(
        picks.map((pick, index) => {
          const lineId = "line-" + (index + 1);
          const existing = current[lineId] ?? [pick.quantity];
          const next = Array.from({ length: count }, (_, bag) => existing[bag] ?? 0);
          next[0] =
            (next[0] ?? 0) + existing.slice(count).reduce((sum, quantity) => sum + quantity, 0);
          return [lineId, next];
        }),
      ),
    );
  }
  function updateSpecialRequests(value: string) {
    if (whatsAppDraft) return;
    setSpecialRequests(value);
    setQuote(null);
    setReviewConfirmed(false);
    setIssue(null);
    attempt.current = null;
    roomAttempt.current = null;
  }
  async function reviewTotal() {
    if (!fulfilment || busy || !canCheckout) return;
    if (whatsAppPaymentAttempt) {
      setIssue(
        "Payment has already been started for this WhatsApp order. Use Resume secure payment to continue the original checkout.",
      );
      return;
    }
    if (fulfilment === "curbside" && !parseKerbsideVehicle(vehicle)) {
      setIssue("Enter the car make, colour and last 4 registration characters.");
      return;
    }
    let notes: string | null;
    try {
      notes = normaliseOrderNotes(specialRequests);
    } catch {
      setIssue(ORDER_NOTES_ERROR_MESSAGE);
      return;
    }
    const requestId = ++checkoutRequestId.current;
    setBusy(true);
    setIssue(null);
    try {
      const result = await checkoutRequest(
        checkoutMode,
        whatsAppDraft
          ? whatsAppQuoteInput(whatsAppDraft)
          : {
              action: "quote",
              fulfilment,
              picks: picks.map(({ brandId, itemId, quantity, selections, crossSelections }) => ({
                brandId,
                itemId,
                quantity,
                selections,
                ...(crossSelections?.length ? { crossSelections } : {}),
              })),
              ...(fulfilment === "curbside" ? { vehicle } : {}),
              ...(notes ? { notes } : {}),
              packing: {
                cutleryRequested,
                separateBags,
                bagCount: separateBags ? bagCount : 1,
                allocations: separateBags
                  ? Object.entries(bagQuantities).flatMap(([lineId, quantities]) =>
                      quantities.flatMap((quantity, bag) =>
                        quantity > 0 ? [{ lineId, bag: bag + 1, quantity }] : [],
                      ),
                    )
                  : [],
              },
            },
        undefined,
        !!whatsAppCheckout,
      );
      if (alive.current && requestId === checkoutRequestId.current && result.quote) {
        if (!orderNotesMatch(notes, result.quote.notes))
          throw new Error(
            "Your special requests could not be confirmed. Review them and try the final total again.",
          );
        setQuote(result.quote);
        if (whatsAppCheckout) setWhatsAppBoundMode(checkoutMode);
        setReviewConfirmed(false);
        attempt.current = { quoteId: result.quote.quoteId, attemptId: crypto.randomUUID() };
      }
    } catch (error) {
      if (alive.current && requestId === checkoutRequestId.current)
        setIssue(error instanceof Error ? error.message : "We couldn't review your total.");
    } finally {
      if (alive.current && requestId === checkoutRequestId.current) setBusy(false);
    }
  }
  async function pay(quoteId: string) {
    if (busy || !canCheckout) return;
    const requestId = ++checkoutRequestId.current;
    setBusy(true);
    setPaymentPending(true);
    setIssue(null);
    try {
      let saved: WhatsAppPaymentAttempt | null = whatsAppPaymentAttempt;
      if (whatsAppCheckout) {
        try {
          saved = readWhatsAppPaymentAttempt(sessionStorage, whatsAppCheckout.handoffId) ?? saved;
        } catch {
          /* Server recovery below remains available. */
        }
        const recovered = whatsAppPaymentRecovery(whatsAppCheckout, saved, quoteId, checkoutMode);
        if ((whatsAppCheckout.orderId || saved || whatsAppCheckout.attemptId) && !recovered)
          throw new Error(
            "This order already has a payment attempt. Reopen your WhatsApp checkout link in the original browser to continue it.",
          );
        if (recovered)
          attempt.current = { quoteId: recovered.quoteId, attemptId: recovered.attemptId };
      }
      if (attempt.current?.quoteId !== quoteId)
        attempt.current = { quoteId, attemptId: crypto.randomUUID() };
      const selected = attempt.current!;
      if (whatsAppCheckout) {
        const recoverable = {
          ...selected,
          checkoutMode,
          ...(whatsAppCheckout.orderId ? { orderId: whatsAppCheckout.orderId } : {}),
        };
        let remembered = false;
        try {
          remembered = rememberWhatsAppPaymentAttempt(
            sessionStorage,
            whatsAppCheckout.handoffId,
            recoverable,
          );
        } catch {
          /* Storage can be unavailable. */
        }
        if (!remembered && whatsAppCheckout.attemptId !== selected.attemptId)
          throw new Error(
            "Allow browser storage before starting secure payment so this checkout can be resumed safely. You can also return to your WhatsApp conversation for help.",
          );
        setWhatsAppPaymentAttempt(recoverable);
      }
      const result = await checkoutRequest(
        checkoutMode,
        {
          action: "pay",
          ...selected,
          reviewConfirmed: true,
        },
        undefined,
        !!whatsAppCheckout,
      );
      if (!alive.current || requestId !== checkoutRequestId.current) return;
      if (!result.checkoutUrl || !result.orderId)
        throw new Error("We couldn't open secure payment. Please try again.");
      if (whatsAppCheckout?.orderId && result.orderId !== whatsAppCheckout.orderId)
        throw new Error(
          "The existing payment could not be verified. Return to your WhatsApp conversation for help.",
        );
      const url = safeMealDeckCheckoutRedirect(result.checkoutUrl);
      if (!url) throw new Error("The payment link could not be verified.");
      try {
        sessionStorage.setItem(checkoutModeKey, checkoutMode);
        if (whatsAppCheckout) {
          rememberWhatsAppPaymentAttempt(sessionStorage, whatsAppCheckout.handoffId, {
            ...selected,
            checkoutMode,
            orderId: result.orderId,
          });
        } else {
          sessionStorage.setItem(
            ATTEMPT_KEY,
            JSON.stringify({
              ...selected,
              orderId: result.orderId,
              basket: encodeLaunchPicks(picks),
              preserveSavedBasket: !!groupCheckout,
            }),
          );
        }
      } catch {
        /* Server still enforces idempotency. */
      }
      window.location.assign(url);
    } catch (error) {
      if (alive.current && requestId === checkoutRequestId.current) {
        setIssue(error instanceof Error ? error.message : "We couldn't open secure payment.");
        setBusy(false);
        setPaymentPending(false);
      }
    }
  }

  async function createPaymentRoom(quoteId: string) {
    if (
      busy ||
      !canCheckout ||
      !groupCheckout ||
      paymentChoice === "host" ||
      !sharedReady ||
      !reviewConfirmed
    )
      return;
    const key = [quoteId, paymentChoice, bagCount, customerIdentity].join(":");
    if (roomAttempt.current?.key !== key)
      roomAttempt.current = { key, attemptId: crypto.randomUUID() };
    const requestId = ++checkoutRequestId.current;
    setBusy(true);
    setIssue(null);
    try {
      const result = await requestSharedPayment(
        checkoutMode,
        {
          action: "create",
          quoteId,
          attemptId: roomAttempt.current.attemptId,
          bagCount,
          splitMode: paymentChoice,
          reviewConfirmed: true,
        },
        getMealDeckCustomerAccessToken,
      );
      if (!alive.current || requestId !== checkoutRequestId.current) return;
      if (result.room.viewer.role !== "organiser" || result.room.splitMode !== paymentChoice)
        throw new Error(
          "The shared payment setup did not match your review. Please refresh and try again.",
        );
      rememberSharedPaymentRoom(result.room.roomId);
      try {
        sessionStorage.setItem(CHECKOUT_MODE_KEY, checkoutMode);
      } catch {
        /* The room link remains usable. */
      }
      window.location.assign(sharedPaymentRoomPath(result.room.roomId));
    } catch (error) {
      if (alive.current && requestId === checkoutRequestId.current) {
        setIssue(error instanceof Error ? error.message : "The payment room could not be opened.");
        setBusy(false);
      }
    }
  }

  return (
    <div className="md-checkout-shell">
      <SiteHeader />
      <main className="md-checkout" id="main-content">
        <Link to="/menus" className="md-checkout-back">
          <ArrowLeft size={18} />
          Back to menus
        </Link>
        <header className="md-checkout-heading">
          <div>
            <p className="md-checkout-eyebrow">ONE ORDER. EVERY CRAVING.</p>
            <h1 ref={checkoutHeading} tabIndex={whatsAppDraft ? -1 : undefined}>
              {orderId
                ? "Your MealDeck order"
                : whatsAppDraft
                  ? "Your WhatsApp checkout."
                  : "Let's make it yours."}
            </h1>
            <p>
              {orderId
                ? "One kitchen. All your favourites. One collection."
                : whatsAppDraft
                  ? "Confirm your checkout details, review the total and pay securely."
                  : "Choose your pickup, confirm your details and pay securely."}
            </p>
          </div>
          <MealDeckLogo className="md-checkout-logo" />
        </header>
        {whatsAppCheckout?.paused && (
          <section className="md-checkout-notice" role="status">
            <h2>Staff need to review this order</h2>
            <p>
              Payment already in progress is not cancelled. Return to your MealDeck WhatsApp
              conversation for help. You can still check an existing order here.
            </p>
            <Link to="/luton">Luton kitchen & contact</Link>
            {" · "}
            <a href="/whatsapp/checkout">Check review status</a>
          </section>
        )}
        {!orderId && whatsAppDraft && (
          <section className="md-checkout-notice" aria-label="WhatsApp order review">
            <h2>Your confirmed WhatsApp choices</h2>
            <p>
              Your food, collection details and packing are saved for this checkout. Your website
              basket and group order stay separate.
            </p>
            <p>
              To change these choices, return to your MealDeck conversation in WhatsApp and ask for
              a new checkout link.
            </p>
            <a href="/whatsapp/checkout">Review the WhatsApp order</a>
          </section>
        )}
        {!orderId && whatsAppPaymentAttempt && (
          <section className="md-checkout-notice" aria-label="Payment recovery">
            <h2>Continue your existing payment</h2>
            <p>
              Payment has already been started for this order. Confirm your checkout details below,
              then return to the same secure payment.
            </p>
            <button
              type="button"
              className="md-checkout-primary"
              disabled={busy || !canCheckout}
              onClick={() => {
                void pay(whatsAppPaymentAttempt.quoteId);
              }}
            >
              {paymentPending ? "Opening secure payment…" : "Resume secure payment"}
            </button>
          </section>
        )}
        {!orderId && basketIssue && (
          <section className="md-checkout-notice md-checkout-error" role="alert">
            <h2>Review the complete group again</h2>
            <p>{basketIssue}</p>
            <Link to="/group-order">Return to your group draft</Link>
          </section>
        )}
        {!orderId && groupCheckout && (
          <section className="md-checkout-notice" aria-label="Group order review">
            <h2>One group order. Choose how to pay.</h2>
            <p>
              Each person’s choices start in a separate numbered bag. Your personal menu basket is
              still saved. Review one payment or the available shared payment options below.
            </p>
            <p>
              {groupCheckout.bags.map((bag) => "Bag " + bag.number + ": " + bag.label).join(" · ")}
            </p>
            <p>
              Names are a reminder on this device; the kitchen receives bag numbers. If you change
              the packing below, check the new bag contents before paying.
            </p>
            <Link to="/group-order">Back to your group draft</Link>
          </section>
        )}
        <KitchenAvailabilityNotice
          status={status}
          current={statusCurrent}
          available={orderingAvailable}
        />
        {status?.prelaunchVerification && (
          <p className="md-checkout-notice" role="status">
            <strong>Private live order check.</strong> This checkout takes a real card payment. The
            kitchen receives the order only after Stripe confirms payment.
          </p>
        )}
        {orderId && (guestSession || checkoutMode === "guest") && (
          <div className="md-checkout-notice md-checkout-identity-note">
            <span>
              {checkoutMode === "guest"
                ? !status
                  ? "Checking this browser's guest session."
                  : guestSession
                    ? "Viewing your private guest order."
                    : "No guest session is available in this browser."
                : "Ordered as a guest on this browser?"}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => chooseCheckoutMode(checkoutMode === "guest" ? "member" : "guest")}
            >
              {checkoutMode === "guest" ? "Use member account" : "View guest order"}
            </button>
          </div>
        )}
        {orderId && !canViewReceipt ? (
          <section className="md-checkout-card">
            <h2>
              {!status
                ? "Checking private order access"
                : checkoutMode === "guest"
                  ? "Use the browser you ordered from"
                  : "Sign in to see your order"}
            </h2>
            <p>
              {checkoutMode === "guest"
                ? "Guest orders are private to the browser used at checkout. If its guest session has expired or cookies were cleared, contact MealDeck with your order reference."
                : "Your order details are private. For a member order, sign in with the same verified email, then reopen this order link."}
            </p>
            {checkoutMode === "member" && accountIssue && <p role="status">{accountIssue}</p>}
            <Link
              to="/account"
              onClick={() => chooseCheckoutMode("member")}
              search={{ returnTo: accountReturnTo, signin: 1 }}
              className="md-checkout-primary"
            >
              Sign in securely
            </Link>
          </section>
        ) : orderId && canViewReceipt ? (
          <>
            {issue && (
              <div className="md-checkout-notice" role="status">
                {issue}
                <button
                  type="button"
                  onClick={() => {
                    void refreshReceipt();
                  }}
                >
                  <RefreshCw size={16} />
                  Refresh order
                </button>
              </div>
            )}
            {!receipt && (
              <section className="md-checkout-card">
                <Loader2 className="md-checkout-spin" />
                <h2>
                  {receiptRefreshed ? "Your order could not be loaded" : "Checking your order"}
                </h2>
                <p>We'll show confirmation once the payment has been verified.</p>
              </section>
            )}
            {receipt && (
              <div className="md-checkout-columns">
                <div>
                  <section className="md-checkout-card md-checkout-confirmation">
                    {receipt.verifiedPaid ? <CheckCircle2 size={36} /> : <Clock3 size={36} />}
                    <p className="md-checkout-eyebrow">
                      {receipt.verifiedPaid
                        ? "PAYMENT CONFIRMED"
                        : receipt.held
                          ? "ORDER NEEDS ATTENTION"
                          : "PAYMENT NOT YET CONFIRMED"}
                    </p>
                    <h2>
                      {receipt.verifiedPaid
                        ? "Thanks — you're on the deck."
                        : cancelled
                          ? "Your basket is waiting for you."
                          : "We're checking your payment."}
                    </h2>
                    {receipt.verifiedPaid && orderDisplayNumber(receipt.orderNumber, "") && (
                      <div className="md-checkout-order-code">
                        <span>Your order number</span>
                        <strong>{orderDisplayNumber(receipt.orderNumber, "")}</strong>
                        <small>Use this number when speaking to our team.</small>
                      </div>
                    )}
                    {receipt.verifiedPaid && receipt.handoffCode && (
                      <div className="md-checkout-collection-code">
                        <span>Collection code</span>
                        <strong>{receipt.handoffCode}</strong>
                        <small>Give this code to the team when your food is handed over.</small>
                      </div>
                    )}
                    {receipt.verifiedPaid && !receipt.completedAt && (
                      <p className="md-checkout-estimate">
                        <Clock3 size={18} />
                        Approx. pickup {clock(receipt.estimatedReadyAt)}
                        <small>
                          About {receipt.collectionEstimateMinutes} minutes from payment. Follow the
                          live ready status before collecting.
                        </small>
                      </p>
                    )}
                    {receipt.verifiedPaid && receipt.fulfilment === "curbside" && (
                      <p>
                        {KERBSIDE_PARKING_INSTRUCTION} For kerbside pickup, we’ll use your car
                        details and confirm your collection code at handoff.
                      </p>
                    )}
                    {!receipt.verifiedPaid && !receipt.held && !receipt.paymentSessionExpired && (
                      <>
                        <p>
                          If payment is still open, you can return to the same secure checkout. This
                          does not create another order.
                        </p>
                        <button
                          className="md-checkout-primary"
                          disabled={busy || !canCheckout}
                          type="button"
                          onClick={() => {
                            void pay(receipt.quoteId);
                          }}
                        >
                          {busy ? (
                            <Loader2 size={18} className="md-checkout-spin" />
                          ) : (
                            <CreditCard size={18} />
                          )}
                          {paymentPending ? "Opening secure payment…" : "Continue payment"}
                        </button>
                        {!canCheckout && (
                          <p className="md-checkout-notice">
                            Payment is currently unavailable. Your order details remain accessible
                            here.
                          </p>
                        )}
                      </>
                    )}
                    {receipt.paymentSessionExpired && !receipt.verifiedPaid && (
                      <p>
                        This payment session has expired.{" "}
                        {whatsAppDraft ? (
                          "Return to your MealDeck WhatsApp conversation for help with this order."
                        ) : (
                          <>
                            <Link to="/checkout" search={{}}>
                              Review your basket again
                            </Link>
                            .
                          </>
                        )}
                      </p>
                    )}
                    {receipt.held && (
                      <p>
                        Your order has a payment adjustment and needs a team review. Please contact
                        MealDeck with your order reference.
                      </p>
                    )}
                    <p className="md-checkout-reference">Reference: {receipt.orderId}</p>
                    {checkoutMode === "guest" && (
                      <div className="md-checkout-guest-receipt">
                        <h3>Your guest order</h3>
                        <p>
                          Keep this order link and use this browser to check its progress. Clearing
                          cookies or ending your guest session removes access.
                        </p>
                        <p>
                          This guest order earns no loyalty points. Registration is optional for
                          future member offers and does not move this order into an account.
                        </p>
                        <Link
                          to="/account"
                          search={{ returnTo: accountReturnTo, signin: 1 }}
                          className="md-checkout-refresh"
                          onClick={() => chooseCheckoutMode("member")}
                        >
                          Register for future orders
                        </Link>
                      </div>
                    )}
                  </section>
                  {receipt.verifiedPaid && <ReceiptProgress receipt={receipt} />}
                  {receipt.verifiedPaid &&
                    !receipt.completedAt &&
                    !receipt.held &&
                    receipt.paymentStatus !== "refunded" && (
                      <OrderNotificationsCard
                        key={checkoutMode + ":" + receipt.orderId}
                        orderId={receipt.orderId}
                        mode={checkoutMode}
                      />
                    )}
                </div>
                <aside className="md-checkout-card md-checkout-summary">
                  <h2>Your order</h2>
                  <p className="md-checkout-location">
                    <MapPin size={16} />
                    Luton · {receipt.fulfilment === "curbside" ? "Kerbside pickup" : "Collection"}
                  </p>
                  <DetailedOrderLines lines={receipt.lines} packingPlan={receipt.packingPlan} />
                  <CheckoutSpecialRequestsReview notes={receipt.notes ?? null} />
                  <CheckoutPriceSummary total={receipt} />
                </aside>
              </div>
            )}
          </>
        ) : (
          <div className="md-checkout-columns">
            <div className="md-checkout-steps">
              {whatsAppDraft ? (
                <section className="md-checkout-card">
                  <h2>
                    <span className="md-checkout-step">1</span>
                    {whatsAppDraft.fulfilment === "curbside"
                      ? "Kerbside pickup"
                      : "Counter collection"}
                  </h2>
                  <p className="md-checkout-location">
                    <MapPin size={16} />
                    Luton kitchen · Confirmed in WhatsApp
                  </p>
                  {whatsAppDraft.vehicle && (
                    <>
                      <p>{KERBSIDE_PARKING_INSTRUCTION}</p>
                      <section
                        className="md-checkout-pickup-review"
                        aria-label="Confirmed car details"
                      >
                        <dl>
                          <div>
                            <dt>Car make</dt>
                            <dd>{whatsAppDraft.vehicle.make}</dd>
                          </div>
                          <div>
                            <dt>Colour</dt>
                            <dd>{whatsAppDraft.vehicle.colour}</dd>
                          </div>
                          <div>
                            <dt>Registration (last 4)</dt>
                            <dd>{whatsAppDraft.vehicle.registrationLast4}</dd>
                          </div>
                        </dl>
                      </section>
                    </>
                  )}
                </section>
              ) : (
                <section className="md-checkout-card">
                  <h2>
                    <span className="md-checkout-step">1</span>How are you collecting?
                  </h2>
                  <p className="md-checkout-location">
                    <MapPin size={16} />
                    Luton kitchen
                  </p>
                  <div className="md-checkout-methods" role="group" aria-label="Pickup method">
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={fulfilment === "pickup"}
                      onClick={() => chooseFulfilment("pickup")}
                    >
                      <ShoppingBag size={25} />
                      <strong>Collection</strong>
                      <span>Pick up at the counter</span>
                      {fulfilment === "pickup" && <Check size={17} />}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={fulfilment === "curbside"}
                      onClick={() => chooseFulfilment("curbside")}
                    >
                      <CarFront size={25} />
                      <strong>Kerbside</strong>
                      <span>Collect by your car</span>
                      {fulfilment === "curbside" && <Check size={17} />}
                    </button>
                  </div>
                  <button
                    className="md-checkout-delivery"
                    type="button"
                    aria-disabled="true"
                    onClick={() => setDeliveryNotice(true)}
                  >
                    <Truck size={19} />
                    <span>
                      Delivery <small>Currently unavailable</small>
                    </span>
                  </button>
                  {deliveryNotice && (
                    <p className="md-checkout-notice" role="status">
                      Delivery is not available at the moment. Please select collection or kerbside.
                    </p>
                  )}
                </section>
              )}
              {fulfilment && (
                <section className="md-checkout-card">
                  <h2>
                    <span className="md-checkout-step">2</span>Your details
                  </h2>
                  {fulfilment === "curbside" && (
                    <p className="md-checkout-muted">
                      For kerbside pickup, we need your name, WhatsApp number, car make, colour and
                      last 4 registration characters.
                    </p>
                  )}
                  {memberEntryVisible &&
                    (guestEligible || guestSession || checkoutMode === "guest") && (
                      <div
                        className="md-checkout-identity-options"
                        role="group"
                        aria-label="Checkout account choice"
                      >
                        <button
                          type="button"
                          disabled={busy || !!whatsAppBoundMode}
                          aria-pressed={checkoutMode === "member"}
                          onClick={() => chooseCheckoutMode("member")}
                        >
                          Member checkout
                        </button>
                        <button
                          type="button"
                          disabled={
                            busy || !!whatsAppBoundMode || (!guestEligible && !guestSession)
                          }
                          aria-pressed={checkoutMode === "guest"}
                          onClick={() => chooseCheckoutMode("guest")}
                        >
                          Continue without registering
                        </button>
                      </div>
                    )}
                  {checkoutMode === "guest" ? (
                    <div className="md-checkout-guest">
                      <p>
                        Enter your name and WhatsApp number. No email registration or verification
                        is needed. Guest orders earn no loyalty points. The 30% opening offer
                        applies during launch hours; other member offers require registration.
                      </p>
                      {whatsAppDraft && (
                        <>
                          <p className="md-checkout-muted">
                            Your name and WhatsApp number are prefilled from the chat. They do not
                            create an account or sign you up for marketing.
                          </p>
                          <label className="md-checkout-check">
                            <input
                              type="checkbox"
                              checked={whatsAppPrivacyAcknowledged}
                              disabled={busy}
                              onChange={(event) =>
                                setWhatsAppPrivacyAcknowledged(event.target.checked)
                              }
                            />
                            <span>
                              <strong>
                                I acknowledge the <Link to="/privacy">Privacy Notice</Link>
                              </strong>
                              <small>
                                MealDeck will use my contact details to process this order and
                                arrange collection.
                              </small>
                            </span>
                          </label>
                        </>
                      )}
                      {whatsAppGuestMismatch && (
                        <p className="md-checkout-notice" role="alert">
                          This browser has different guest contact details from your WhatsApp order.
                          To use the contact details from your chat, end the current guest session
                          first. This removes this browser’s access to earlier guest receipts.
                        </p>
                      )}
                      {!guestEligible && (
                        <p className="md-checkout-notice" role="status">
                          Guest checkout is available only during launch opening hours. Existing
                          guest orders remain accessible in this browser.
                        </p>
                      )}
                      {guestSession ? (
                        <>
                          <div className="md-checkout-member">
                            <ShoppingBag size={25} />
                            <div>
                              <strong>{guestSession.name}</strong>
                              {guestSession.email && <span>{guestSession.email}</span>}
                              <span>WhatsApp: {guestSession.phone}</span>
                              <small>Guest contact details</small>
                            </div>
                          </div>
                          <p className="md-checkout-muted">
                            To use different contact details, end this guest session first. This
                            removes access to earlier guest receipts in this browser.
                          </p>
                          <button
                            type="button"
                            className="md-checkout-refresh"
                            disabled={busy}
                            onClick={() => {
                              void endGuestSession();
                            }}
                          >
                            End guest session
                          </button>
                        </>
                      ) : (
                        <form
                          className="md-checkout-guest-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void saveGuestDetails();
                          }}
                        >
                          <fieldset disabled={busy || !guestEligible}>
                            <legend className="sr-only">Guest contact details</legend>
                            <label>
                              Your name
                              <input
                                required
                                autoComplete="name"
                                maxLength={120}
                                readOnly={!!whatsAppDraft}
                                value={guestDetails.name}
                                onChange={(event) =>
                                  setGuestDetails({ ...guestDetails, name: event.target.value })
                                }
                              />
                            </label>
                            <label>
                              WhatsApp number
                              <input
                                required
                                type="tel"
                                autoComplete="tel"
                                maxLength={40}
                                readOnly={!!whatsAppDraft}
                                placeholder="e.g. 07700 900123"
                                value={guestDetails.phone}
                                onChange={(event) =>
                                  setGuestDetails({ ...guestDetails, phone: event.target.value })
                                }
                              />
                            </label>
                            <p className="md-checkout-muted">
                              We use these details to process your order and contact you about
                              collection. Continuing acknowledges our{" "}
                              <Link to="/privacy">Privacy Notice</Link>. This does not sign you up
                              for marketing.
                            </p>
                            <button
                              type="submit"
                              className="md-checkout-primary"
                              disabled={!!whatsAppDraft && !whatsAppPrivacyAcknowledged}
                            >
                              {busy ? (
                                <Loader2 size={18} className="md-checkout-spin" />
                              ) : (
                                <Check size={18} />
                              )}
                              Save guest details
                            </button>
                          </fieldset>
                        </form>
                      )}
                      {guestIssue && (
                        <p className="md-checkout-notice" role="alert">
                          {guestIssue}
                        </p>
                      )}
                    </div>
                  ) : registered && account?.status === "signed_in" ? (
                    <div className="md-checkout-member">
                      <MailCheck size={25} />
                      <div>
                        <strong>{account.profile.name}</strong>
                        <span>{account.profile.email}</span>
                        <span>
                          {fulfilment === "curbside" ? "WhatsApp: " : ""}
                          {account.profile.phone}
                        </span>
                        <small>Email verified</small>
                      </div>
                      <Link to="/account" search={{ returnTo: accountReturnTo, signin: 1 }}>
                        Edit
                      </Link>
                    </div>
                  ) : (
                    <>
                      <p>
                        {entryPolicy?.emailRegistrationDeferred !== false
                          ? "For quick checkout, choose Continue as guest and enter your name and WhatsApp number. Existing members can still sign in."
                          : "Register with your name, email and mobile number. We’ll verify your email before member checkout."}
                      </p>
                      <div className="md-checkout-benefit">
                        <ShieldCheck size={21} />
                        <p>
                          Members and guests receive the 30% opening offer during launch hours.
                          Register for future member offers; marketing is optional.
                        </p>
                      </div>
                      {accountIssue && (
                        <p className="md-checkout-muted" role="status">
                          {accountIssue}
                        </p>
                      )}
                      <Link
                        to="/account"
                        search={{ returnTo: accountReturnTo, signin: 1 }}
                        className="md-checkout-primary"
                      >
                        {entryPolicy?.emailRegistrationDeferred !== false
                          ? "Existing member sign-in"
                          : account?.status === "signed_in"
                            ? "Finish registration"
                            : "Register or sign in"}
                      </Link>
                    </>
                  )}
                  <p className="md-checkout-muted">
                    No address is needed for collection or kerbside pickup.
                  </p>
                </section>
              )}
              {fulfilment === "curbside" && !whatsAppDraft && (
                <section className="md-checkout-card">
                  <h2>
                    <span className="md-checkout-step">3</span>Your car details
                  </h2>
                  <p className="md-checkout-muted">{KERBSIDE_PARKING_INSTRUCTION}</p>
                  <p className="md-checkout-muted">All three car details are required.</p>
                  <div className="md-checkout-vehicle">
                    <label>
                      Car make
                      <input
                        required
                        disabled={busy}
                        value={vehicle.make}
                        minLength={2}
                        maxLength={60}
                        autoComplete="off"
                        placeholder="e.g. Volkswagen"
                        onChange={(event) => {
                          setVehicle({ ...vehicle, make: event.target.value });
                          setQuote(null);
                          setReviewConfirmed(false);
                        }}
                      />
                    </label>
                    <label>
                      Colour
                      <input
                        required
                        disabled={busy}
                        value={vehicle.colour}
                        minLength={2}
                        maxLength={40}
                        autoComplete="off"
                        placeholder="e.g. Blue"
                        onChange={(event) => {
                          setVehicle({ ...vehicle, colour: event.target.value });
                          setQuote(null);
                          setReviewConfirmed(false);
                        }}
                      />
                    </label>
                    <label>
                      Last 4 registration characters
                      <input
                        required
                        disabled={busy}
                        value={vehicle.registrationLast4}
                        minLength={4}
                        maxLength={4}
                        pattern="[A-Za-z0-9]{4}"
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="e.g. 4ABC"
                        onChange={(event) => {
                          setVehicle({
                            ...vehicle,
                            registrationLast4: event.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9]/g, ""),
                          });
                          setQuote(null);
                          setReviewConfirmed(false);
                        }}
                      />
                      <small>Letters and numbers only. We don't need your full registration.</small>
                    </label>
                  </div>
                </section>
              )}
              {canViewReceipt && whatsAppDraft && (
                <section className="md-checkout-card">
                  <h2>
                    <span className="md-checkout-step">3</span>Packing & final check
                  </h2>
                  <p>
                    {whatsAppDraft.packingPlan.separateBags
                      ? "Your order is assigned to " +
                        whatsAppDraft.packingPlan.bagCount +
                        " numbered bags."
                      : "Your order will be packed together."}{" "}
                    {whatsAppDraft.packingPlan.cutleryRequested
                      ? "Cutlery is requested."
                      : "Cutlery is not requested."}
                  </p>
                  <CheckoutSpecialRequestsReview notes={whatsAppDraft.notes || null} />
                  <p>
                    Review every item, choice and bag in the kitchen’s final total before confirming
                    payment.
                  </p>
                </section>
              )}
              {canViewReceipt && fulfilment && picks.length > 0 && !whatsAppDraft && (
                <section className="md-checkout-card md-checkout-packing">
                  <h2>
                    <span className="md-checkout-step">
                      {fulfilment === "curbside" ? "4" : "3"}
                    </span>
                    Packing & final check
                  </h2>
                  <label className="md-checkout-check">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={cutleryRequested}
                      onChange={(event) => {
                        setCutleryRequested(event.target.checked);
                        setQuote(null);
                        setReviewConfirmed(false);
                      }}
                    />
                    <span>
                      <strong>Include cutlery, please</strong>
                      <small>Optional. There is no extra charge.</small>
                    </span>
                  </label>
                  <fieldset disabled={busy}>
                    <legend>How should we pack your order?</legend>
                    <label className="md-checkout-check">
                      <input
                        type="radio"
                        name="packing"
                        checked={!separateBags}
                        onChange={() => {
                          setSeparateBags(false);
                          setQuote(null);
                          setReviewConfirmed(false);
                        }}
                      />
                      <span>Pack together</span>
                    </label>
                    <label className="md-checkout-check">
                      <input
                        type="radio"
                        name="packing"
                        checked={separateBags}
                        onChange={() => {
                          setSeparateBags(true);
                          updateBagCount(
                            Math.min(
                              2,
                              picks.reduce((sum, pick) => sum + pick.quantity, 0),
                            ),
                          );
                        }}
                      />
                      <span>
                        Separate numbered bags
                        <small>Keep each person's meal together as Bag 1, Bag 2 and so on.</small>
                      </span>
                    </label>
                  </fieldset>
                  {separateBags && (
                    <div className="md-checkout-bag-editor">
                      <label className="md-checkout-bag-count">
                        Number of bags
                        <select
                          disabled={busy}
                          value={bagCount}
                          onChange={(event) => updateBagCount(Number(event.target.value))}
                        >
                          {Array.from(
                            {
                              length: Math.min(
                                10,
                                picks.reduce((sum, pick) => sum + pick.quantity, 0),
                              ),
                            },
                            (_, index) => (
                              <option key={index} value={index + 1}>
                                {index + 1}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <p className="md-checkout-muted">
                        Set the quantity of each item in each bag. Meal upgrades and linked extras
                        stay with their main.
                      </p>
                      {picks.map((pick, index) => {
                        const lineId = "line-" + (index + 1);
                        const quantities = bagQuantities[lineId] ?? [pick.quantity];
                        const assigned = quantities.reduce((sum, quantity) => sum + quantity, 0);
                        const found = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);
                        return (
                          <fieldset className="md-checkout-bag-item" key={pick.key} disabled={busy}>
                            <legend>
                              {pick.quantity} × {found?.item.name}
                            </legend>
                            <p className="md-checkout-muted">
                              {found
                                ? launchSelectionLabels(
                                    found.brand,
                                    found.item,
                                    pick.selections,
                                    pick.crossSelections,
                                  ).join(" · ")
                                : ""}
                            </p>
                            <div className="md-checkout-bag-quantities">
                              {Array.from({ length: bagCount }, (_, bag) => (
                                <label key={bag}>
                                  Bag {bag + 1}
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={pick.quantity}
                                    value={quantities[bag] ?? 0}
                                    onChange={(event) => {
                                      const quantity = Math.max(
                                        0,
                                        Math.min(
                                          pick.quantity,
                                          Number.parseInt(event.target.value, 10) || 0,
                                        ),
                                      );
                                      setBagQuantities((current) => ({
                                        ...current,
                                        [lineId]: Array.from({ length: bagCount }, (_, offset) =>
                                          offset === bag
                                            ? quantity
                                            : (current[lineId]?.[offset] ?? 0),
                                        ),
                                      }));
                                      setQuote(null);
                                      setReviewConfirmed(false);
                                    }}
                                    aria-label={found?.item.name + ", quantity in Bag " + (bag + 1)}
                                  />
                                </label>
                              ))}
                            </div>
                            <p
                              className={
                                assigned === pick.quantity
                                  ? "md-checkout-muted"
                                  : "md-checkout-allocation-error"
                              }
                            >
                              {assigned} of {pick.quantity} assigned
                              {assigned !== pick.quantity ? " — check your quantities" : ""}
                            </p>
                          </fieldset>
                        );
                      })}
                    </div>
                  )}
                  <CheckoutSpecialRequests
                    value={specialRequests}
                    disabled={busy}
                    onChange={updateSpecialRequests}
                  />
                  <p className="md-checkout-review-prompt">
                    Please check your order before confirming and paying.
                  </p>
                  <p className="md-checkout-muted">
                    Check every item, quantity, flavour, extra and bag. We'll show the current
                    kitchen total before payment.
                  </p>
                </section>
              )}
            </div>
            <aside className="md-checkout-card md-checkout-summary">
              <h2>Your basket</h2>
              {!basketLoaded ? (
                <p>Loading your basket…</p>
              ) : picks.length === 0 ? (
                <div className="md-checkout-empty">
                  <ShoppingBag size={34} />
                  <p>Your basket is empty.</p>
                  <Link to="/menus" className="md-checkout-primary">
                    Explore the menus
                  </Link>
                </div>
              ) : (
                <>
                  {quote ? (
                    <>
                      <p className="md-checkout-verified-total">
                        <ShieldCheck size={17} />
                        Current kitchen prices confirmed
                      </p>
                      <DetailedOrderLines lines={quote.lines} packingPlan={quote.packingPlan} />
                      <CheckoutSpecialRequestsReview notes={quote.notes ?? null} />
                      {fulfilment === "curbside" && pickupContact && (
                        <section
                          className="md-checkout-pickup-review"
                          aria-label="Kerbside pickup details"
                        >
                          <h3>Kerbside pickup details</h3>
                          <dl>
                            <div>
                              <dt>Name</dt>
                              <dd>{pickupContact.name}</dd>
                            </div>
                            <div>
                              <dt>WhatsApp number</dt>
                              <dd>{pickupContact.phone}</dd>
                            </div>
                            <div>
                              <dt>Car make</dt>
                              <dd>{vehicle.make.trim()}</dd>
                            </div>
                            <div>
                              <dt>Colour</dt>
                              <dd>{vehicle.colour.trim()}</dd>
                            </div>
                            <div>
                              <dt>Registration (last 4)</dt>
                              <dd>{vehicle.registrationLast4}</dd>
                            </div>
                          </dl>
                        </section>
                      )}
                    </>
                  ) : (
                    <ul>
                      {picks.map((pick, index) => {
                        const found = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);
                        return (
                          <li key={pick.key}>
                            <div>
                              <strong>
                                {pick.quantity} × {found?.item.name}
                              </strong>
                              <small>
                                {found?.brand.name}
                                {found
                                  ? " · " +
                                    [
                                      ...launchSelectionLabels(
                                        found.brand,
                                        found.item,
                                        pick.selections,
                                        pick.crossSelections,
                                      ),
                                      ...launchCrossSelectionSummaries(
                                        found.brand,
                                        found.item,
                                        pick.selections,
                                        pick.crossSelections,
                                        catalogue,
                                      ).map((choice) => choice.label),
                                    ].join(" · ")
                                  : ""}
                              </small>
                              {isMealDeckMilkcakePromotion(found?.item.promotion) && (
                                <small>
                                  <MilkcakeOfferTerms explained />
                                </small>
                              )}
                            </div>
                            <span>
                              {formatLaunchPromotionalPrice(
                                basketPrice.lines[index]!.displayedItemsSubtotalPence,
                                basketPrice.lines[index]!.promotionQuantity
                                  ? found?.item.promotion
                                  : undefined,
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {whatsAppDraft ? (
                    <p className="md-checkout-muted">
                      To change this order, return to the MealDeck conversation in WhatsApp.
                    </p>
                  ) : (
                    <Link to="/menus" className="md-checkout-edit">
                      Edit basket
                    </Link>
                  )}
                  {groupCheckout && (
                    <GroupPaymentChoice
                      value={paymentChoice}
                      onChange={(next) => {
                        setPaymentChoice(next);
                        setQuote(null);
                        setReviewConfirmed(false);
                        attempt.current = null;
                        roomAttempt.current = null;
                      }}
                      available={sharedAvailable}
                      loading={sharedLoading}
                      message={
                        sharedCapabilities?.available &&
                        checkoutMode === "guest" &&
                        !sharedCapabilities.guestEligible
                          ? "Shared guest payment is unavailable right now. Choose member checkout to check member options."
                          : (sharedCapabilities?.message ?? "")
                      }
                      bagCount={separateBags ? bagCount : 0}
                      disabled={busy}
                      onRefresh={() => setSharedRefresh((value) => value + 1)}
                    />
                  )}
                  {quote ? (
                    <CheckoutPriceSummary total={quote} />
                  ) : (
                    <dl className="md-checkout-totals">
                      <div className="md-checkout-total">
                        <dt>Menu subtotal</dt>
                        <dd>{formatLaunchMenuPrice(displayTotal)}</dd>
                      </div>
                    </dl>
                  )}
                  {quote?.discountPence ? (
                    <p className="md-checkout-offer">
                      {hasMilkcakeOffer
                        ? "One milkcake is 99p with the discount included. Additional milkcakes are £3.99 each before the usual 30% discount, applied above with the other eligible items and extras."
                        : "30% off every item and upgrade. No minimum order."}
                    </p>
                  ) : !quote && status?.openingOffer.status === "active" ? (
                    <p className="md-checkout-offer">
                      {hasMilkcakeOffer
                        ? "One milkcake per order is 99p with the discount included. Additional milkcakes are £3.99 each before the usual 30% discount, confirmed with your final total."
                        : "Your 30% opening discount will be applied to the verified checkout total."}
                    </p>
                  ) : null}
                  <CheckoutActionFeedback issue={issue} paymentPending={paymentPending} />
                  {canCheckout &&
                    fulfilment &&
                    (quote ? (
                      <>
                        <p className="md-checkout-muted">
                          <Clock3 size={16} />
                          Approx. {quote.collectionEstimateMinutes} minutes after{" "}
                          {paymentChoice === "host"
                            ? "payment"
                            : "all required payments are confirmed"}
                          .
                        </p>
                        <label className="md-checkout-check md-checkout-review-ack">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={reviewConfirmed}
                            onChange={(event) => setReviewConfirmed(event.target.checked)}
                          />
                          <span>
                            <strong>I've checked my order</strong>
                            <small>
                              Items, quantities, flavours, extras, numbered bags, cutlery and
                              special requests are correct.
                              {fulfilment === "curbside" &&
                                " My name, WhatsApp number and car details are also correct."}
                            </small>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="md-checkout-primary"
                          disabled={
                            busy || !reviewConfirmed || (paymentChoice !== "host" && !sharedReady)
                          }
                          onClick={() => {
                            if (reviewConfirmed) {
                              if (paymentChoice === "host") void pay(quote.quoteId);
                              else void createPaymentRoom(quote.quoteId);
                            }
                          }}
                        >
                          {busy ? (
                            <Loader2 size={18} className="md-checkout-spin" />
                          ) : (
                            <CreditCard size={18} />
                          )}
                          {paymentPending
                            ? "Opening secure payment…"
                            : paymentChoice === "host"
                              ? "Confirm & pay " + formatLaunchMenuPrice(quote.totalPence)
                              : "Confirm & open payment room"}
                        </button>
                        <button
                          type="button"
                          className="md-checkout-refresh"
                          disabled={busy || !!whatsAppPaymentAttempt}
                          onClick={() => {
                            void reviewTotal();
                          }}
                        >
                          Refresh total
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="md-checkout-primary"
                        disabled={
                          busy ||
                          !!whatsAppPaymentAttempt ||
                          !publicMenu.ready ||
                          displayTotal === null
                        }
                        onClick={() => {
                          void reviewTotal();
                        }}
                      >
                        {busy ? (
                          <Loader2 size={18} className="md-checkout-spin" />
                        ) : (
                          <PackageCheck size={18} />
                        )}
                        Review final total
                      </button>
                    ))}
                  <div className="md-checkout-payments">
                    <ShieldCheck size={17} />
                    <span>
                      Secure payment with Stripe
                      <br />
                      <small>
                        Cards · Apple Pay · Google Pay where available. Your bank may ask you to
                        authenticate.
                      </small>
                    </span>
                  </div>
                  <p className="md-checkout-muted">
                    Payment is confirmed securely before the kitchen receives your order.
                  </p>
                </>
              )}
            </aside>
          </div>
        )}
        <p className="md-checkout-legal">
          MealDeck is a trading name of 313 Brands Ltd.{" "}
          <Link to="/privacy">Privacy & your choices</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
