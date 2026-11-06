import { Check, Loader2, MailCheck, RefreshCw, ShoppingBag } from "lucide-react";
import { rememberSharedPaymentRoom } from "@/lib/mealdeck-shared-payments-browser";
import type { PaymentIdentityState } from "./use-payment-identity";

export function PaymentIdentity({
  identity,
  roomId,
  disabled,
  onGuestSaved,
  returnTo = "/group-pay",
  onRememberRoom,
  purpose = "payment",
}: {
  identity: PaymentIdentityState;
  roomId: string;
  disabled: boolean;
  onGuestSaved: () => void;
  returnTo?: "/group-pay" | "/group-order";
  onRememberRoom?: () => void;
  purpose?: "payment" | "organiser";
}) {
  const accountHref = "/account?returnTo=" + encodeURIComponent(returnTo);
  return (
    <section
      className="md-shared-card md-shared-identity"
      aria-labelledby="shared-payment-identity"
    >
      <span className="md-shared-kicker">
        {purpose === "organiser" ? "Organiser details" : "Your payment"}
      </span>
      <h2 id="shared-payment-identity">
        {purpose === "organiser" ? "Who’s organising the collection?" : "Choose how to continue."}
      </h2>
      <div className="md-shared-identity-options" role="group" aria-label="Payment identity">
        <button
          type="button"
          disabled={disabled || identity.guestBusy}
          aria-pressed={identity.mode === "member"}
          onClick={() => identity.chooseMode("member")}
        >
          Member
        </button>
        <button
          type="button"
          disabled={disabled || identity.guestBusy}
          aria-pressed={identity.mode === "guest"}
          onClick={() => identity.chooseMode("guest")}
        >
          Guest
        </button>
      </div>
      {identity.loading ? (
        <p role="status">Checking your details…</p>
      ) : identity.mode === "member" ? (
        identity.account?.status === "signed_in" && identity.account.profile.registered ? (
          <div className="md-shared-identity-summary">
            <MailCheck size={24} aria-hidden="true" />
            <div>
              <strong>{identity.account.profile.name}</strong>
              <span>{identity.account.profile.email}</span>
              <small>Verified member account</small>
            </div>
          </div>
        ) : (
          <>
            <p>
              {identity.account?.status === "unverified"
                ? purpose === "organiser"
                  ? "Verify your email to organise this room as a member."
                  : "Verify your email before making a member payment."
                : purpose === "organiser"
                  ? "Sign in or register with a verified email to organise the collection."
                  : "Sign in or register with a verified email to make a member payment."}
            </p>
            {identity.accountIssue && (
              <p className="md-shared-notice" role="status">
                {identity.accountIssue}
              </p>
            )}
            <a
              className="md-shared-button"
              href={accountHref}
              onClick={() => {
                if (onRememberRoom) onRememberRoom();
                else rememberSharedPaymentRoom(roomId);
              }}
            >
              Sign in or register
            </a>
            <p className="md-shared-muted">
              You’ll return to{" "}
              {returnTo === "/group-order" ? "group ordering" : "this payment room"}. Marketing
              choices stay optional.
            </p>
          </>
        )
      ) : (
        <>
          <p>
            {purpose === "organiser"
              ? "Organise the collection with guest contact details."
              : "Pay without creating an account."}{" "}
            Guest payments earn no loyalty points and do not sign you up for marketing.
          </p>
          {identity.guest?.session ? (
            <div className="md-shared-identity-summary">
              <ShoppingBag size={24} aria-hidden="true" />
              <div>
                <strong>{identity.guest.session.name}</strong>
                <span>{identity.guest.session.email}</span>
                <span>{identity.guest.session.phone}</span>
                <small>Guest contact details saved in this browser</small>
              </div>
            </div>
          ) : identity.guest?.eligible ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void identity.saveGuest().then((saved) => {
                  if (saved) onGuestSaved();
                });
              }}
            >
              <fieldset disabled={disabled || identity.guestBusy}>
                <legend className="sr-only">Guest contact details</legend>
                <label>
                  Your name
                  <input
                    required
                    autoComplete="name"
                    maxLength={120}
                    value={identity.details.name}
                    onChange={(event) =>
                      identity.setDetails({ ...identity.details, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={254}
                    value={identity.details.email}
                    onChange={(event) =>
                      identity.setDetails({ ...identity.details, email: event.target.value })
                    }
                  />
                </label>
                <label>
                  Mobile number
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                    placeholder="e.g. 07700 900123"
                    value={identity.details.phone}
                    onChange={(event) =>
                      identity.setDetails({ ...identity.details, phone: event.target.value })
                    }
                  />
                </label>
                <p className="md-shared-muted">
                  We use these details for your payment and order. Continuing acknowledges our{" "}
                  <a href="/privacy">Privacy Notice</a>. A secure cookie protects guest access in
                  this browser.
                </p>
                <button type="submit" className="md-shared-button">
                  {identity.guestBusy ? (
                    <Loader2 size={18} className="md-shared-spin" aria-hidden="true" />
                  ) : (
                    <Check size={18} aria-hidden="true" />
                  )}{" "}
                  Save guest details
                </button>
              </fieldset>
            </form>
          ) : (
            <p className="md-shared-notice">
              Guest payment is not available right now. Sign in with a verified member account to
              check the available payment options. Existing payment progress remains visible.
            </p>
          )}
          {identity.guestIssue && (
            <p className="md-shared-error" role="alert">
              {identity.guestIssue}
            </p>
          )}
        </>
      )}
      <button
        type="button"
        className="md-shared-text-button"
        disabled={disabled || identity.loading || identity.guestBusy}
        onClick={() => {
          void identity.refresh().then(onGuestSaved);
        }}
      >
        <RefreshCw size={16} aria-hidden="true" /> Refresh my details
      </button>
    </section>
  );
}
