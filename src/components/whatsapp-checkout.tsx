import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CarFront,
  Loader2,
  LockKeyhole,
  MapPin,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { MealDeckLogo } from "./mealdeck-logo";
import { LaunchCheckout } from "./launch-checkout";
import { usePublicMenu } from "./menus/use-public-menu";
import { findLaunchMenuItem, launchSelectionLabels } from "@/lib/launch-menu-picks";
import { launchCrossSelectionSummaries } from "@/lib/launch-menu-upsells";
import type { LaunchMenuBrand } from "@/lib/launch-menu-catalogue";
import {
  loadWhatsAppCheckoutIntake,
  requestWhatsAppCheckout,
  WhatsAppCheckoutLinkError,
  type WhatsAppCheckoutContext,
  type WhatsAppCheckoutDraft,
} from "@/lib/mealdeck-whatsapp-checkout-browser";

export function WhatsAppDraftReview({
  draft,
  catalogue,
}: {
  draft: WhatsAppCheckoutDraft;
  catalogue: LaunchMenuBrand[];
}) {
  return (
    <>
      <section
        className="md-checkout-card md-whatsapp-food"
        aria-labelledby="whatsapp-food-heading"
      >
        <p className="md-checkout-eyebrow">YOUR WHATSAPP CHOICES</p>
        <h2 id="whatsapp-food-heading">One order. Ready to review.</h2>
        <ul className="md-whatsapp-items">
          {draft.picks.map((pick, index) => {
            const found = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);
            const choices = found
              ? [
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
                ]
              : [];
            const bags = draft.packingPlan.allocations.filter(
              (allocation) => allocation.lineId === "line-" + (index + 1),
            );
            return (
              <li key={pick.key}>
                <span className="md-whatsapp-quantity" aria-label={pick.quantity + " items"}>
                  {pick.quantity}×
                </span>
                <div>
                  <strong>{found?.item.name ?? "Menu item awaiting verification"}</strong>
                  {found && <span>{found.brand.name}</span>}
                  {choices.length > 0 && <p>{choices.join(" · ")}</p>}
                  {bags.length > 0 && (
                    <small>
                      {bags
                        .map((allocation) => "Bag " + allocation.bag + " × " + allocation.quantity)
                        .join(" · ")}
                    </small>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="md-checkout-muted">
          The kitchen will check current availability and the final total before you pay.
        </p>
      </section>
      <section className="md-checkout-card" aria-labelledby="whatsapp-collection-heading">
        <h2 id="whatsapp-collection-heading">
          {draft.fulfilment === "curbside" ? (
            <CarFront size={24} aria-hidden="true" />
          ) : (
            <ShoppingBag size={24} aria-hidden="true" />
          )}
          {draft.fulfilment === "curbside" ? "Kerbside pickup" : "Counter collection"}
        </h2>
        <p className="md-checkout-location">
          <MapPin size={16} aria-hidden="true" />
          Luton kitchen
        </p>
        <dl className="md-whatsapp-details">
          <div>
            <dt>Name from your chat</dt>
            <dd>{draft.customer.name}</dd>
          </div>
          <div>
            <dt>WhatsApp number</dt>
            <dd>{draft.customer.phone}</dd>
          </div>
          {draft.vehicle && (
            <>
              <div>
                <dt>Car</dt>
                <dd>
                  {draft.vehicle.colour} {draft.vehicle.make}
                </dd>
              </div>
              <div>
                <dt>Registration, last 4</dt>
                <dd>{draft.vehicle.registrationLast4}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Packing</dt>
            <dd>
              {draft.packingPlan.separateBags
                ? draft.packingPlan.bagCount + " numbered bags"
                : "Pack together"}
            </dd>
          </div>
          <div>
            <dt>Cutlery</dt>
            <dd>{draft.packingPlan.cutleryRequested ? "Requested" : "Not requested"}</dd>
          </div>
          {draft.notes && (
            <div>
              <dt>Special requests</dt>
              <dd className="md-whatsapp-notes">{draft.notes}</dd>
            </div>
          )}
        </dl>
      </section>
    </>
  );
}

function WhatsAppCheckoutReview({
  context,
  onContinue,
}: {
  context: WhatsAppCheckoutContext;
  onContinue: () => void;
}) {
  const { catalogue } = usePublicMenu();
  return (
    <div className="md-whatsapp-layout">
      <div className="md-checkout-steps">
        <WhatsAppDraftReview draft={context.draft} catalogue={catalogue} />
      </div>
      <aside className="md-checkout-card md-whatsapp-next">
        <LockKeyhole size={28} aria-hidden="true" />
        <h2>{context.orderId ? "Your checkout is saved" : "Next, secure checkout"}</h2>
        <p>
          {context.orderId
            ? "Open your existing order to check payment and collection progress."
            : "Check these choices, confirm your checkout details and review the kitchen’s total. Payment opens securely with Stripe."}
        </p>
        <p className="md-whatsapp-preserved">
          Your website basket and group order stay saved separately.
        </p>
        {context.paused && (
          <div className="md-checkout-notice" role="status">
            <p>
              Staff need to review this order. Payment already in progress is not cancelled. Return
              to your MealDeck WhatsApp conversation for help.
            </p>
            <a href="/whatsapp/checkout" className="md-checkout-back">
              Check review status
            </a>
          </div>
        )}
        <button
          type="button"
          className="md-checkout-primary"
          disabled={context.paused && !context.orderId}
          onClick={onContinue}
        >
          {context.orderId ? "View your order" : "Continue to secure checkout"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="md-checkout-muted">
          Chat details do not sign you in. Guest privacy acknowledgement and the final order check
          happen at checkout.
        </p>
        <div className="md-whatsapp-change">
          <MessageCircle size={19} aria-hidden="true" />
          <p>
            Need to change your food, packing or collection details? Return to the MealDeck
            conversation in WhatsApp and ask for a new checkout link.
          </p>
        </div>
        <Link to="/privacy">Privacy Notice</Link>
      </aside>
    </div>
  );
}

export function WhatsAppCheckout() {
  const [context, setContext] = useState<WhatsAppCheckoutContext | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const [loading, setLoading] = useState(true);
  const [continued, setContinued] = useState(false);
  const intake = useRef<Promise<WhatsAppCheckoutContext> | null>(null);
  const requestId = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let mounted = true;
    // Share this one request across React's development effect replay. A capability is redeemed once.
    intake.current ??= loadWhatsAppCheckoutIntake();
    const observe = (pending: Promise<WhatsAppCheckoutContext>) => {
      const current = ++requestId.current;
      void pending
        .then((value) => {
          if (mounted && current === requestId.current) setContext(value);
        })
        .catch((error: unknown) => {
          if (!mounted || current !== requestId.current) return;
          setInvalidLink(error instanceof WhatsAppCheckoutLinkError);
          setIssue(
            error instanceof Error
              ? error.message
              : "We couldn't open secure checkout. Please try again.",
          );
        })
        .finally(() => {
          if (mounted && current === requestId.current) setLoading(false);
        });
    };
    observe(intake.current);
    const openFreshLink = () => {
      setContext(null);
      setContinued(false);
      setIssue(null);
      setInvalidLink(false);
      setLoading(true);
      intake.current = loadWhatsAppCheckoutIntake();
      observe(intake.current);
    };
    window.addEventListener("hashchange", openFreshLink);
    return () => {
      mounted = false;
      requestId.current += 1;
      window.removeEventListener("hashchange", openFreshLink);
    };
  }, []);

  async function resume() {
    const current = ++requestId.current;
    setLoading(true);
    setIssue(null);
    try {
      const value = await requestWhatsAppCheckout({ action: "current" });
      if (current === requestId.current) {
        setContext(value);
        setInvalidLink(false);
      }
    } catch (error) {
      if (current !== requestId.current) return;
      setInvalidLink(error instanceof WhatsAppCheckoutLinkError);
      setIssue(
        error instanceof Error
          ? error.message
          : "We couldn't open secure checkout. Please try again.",
      );
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!loading) heading.current?.focus();
  }, [loading]);

  if (context && continued)
    return (
      <LaunchCheckout
        whatsAppCheckout={context}
        {...(context.orderId ? { orderId: context.orderId } : {})}
      />
    );

  return (
    <div className="md-checkout-shell md-whatsapp-shell">
      <SiteHeader />
      <main className="md-checkout" id="main-content">
        <Link to="/menus" className="md-checkout-back">
          <ArrowLeft size={18} aria-hidden="true" />
          Browse menus
        </Link>
        <header className="md-checkout-heading">
          <div>
            <p className="md-checkout-eyebrow">FROM YOUR CHAT TO THE KITCHEN</p>
            <h1 ref={heading} tabIndex={-1}>
              {issue ? "Let’s reconnect your order." : "Your MealDeck order."}
            </h1>
            <p>Your WhatsApp choices, ready for a final check.</p>
          </div>
          <MealDeckLogo className="md-checkout-logo" />
        </header>
        {loading ? (
          <section
            className="md-checkout-card md-whatsapp-loading"
            role="status"
            aria-live="polite"
          >
            <Loader2 size={24} className="md-checkout-spin" aria-hidden="true" />
            <h2>Opening your private checkout</h2>
            <p>Checking your link and confirmed choices…</p>
          </section>
        ) : issue ? (
          <section className="md-checkout-card md-whatsapp-error" role="alert">
            <h2>
              {invalidLink ? "A fresh checkout link is needed" : "Checkout could not connect"}
            </h2>
            <p>{issue}</p>
            <p>
              Open your MealDeck conversation in WhatsApp to continue. For order help, use the
              contact details on our Luton page.
            </p>
            <div className="md-whatsapp-actions">
              {!invalidLink && (
                <button
                  type="button"
                  className="md-checkout-primary"
                  onClick={() => {
                    void resume();
                  }}
                >
                  Retry secure checkout
                </button>
              )}
              <Link to="/luton" className="md-checkout-back">
                Luton kitchen & contact
              </Link>
              <Link to="/menus" className="md-checkout-back">
                Browse the menus
              </Link>
            </div>
          </section>
        ) : context ? (
          <WhatsAppCheckoutReview context={context} onContinue={() => setContinued(true)} />
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
