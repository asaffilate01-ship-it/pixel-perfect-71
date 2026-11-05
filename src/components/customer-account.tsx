import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Gift,
  LogOut,
  Mail,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { MealDeckLogo } from "./mealdeck-logo";
import { PwaInstallCard } from "./pwa-install-card";
import { CustomerOrders } from "./customer-orders";
import {
  CustomerAccountError,
  EMPTY_CUSTOMER_PREFERENCES,
  validateCustomerRegistration,
  type CustomerCapabilities,
  type CustomerPreferences,
  type CustomerRegistration,
  type MealDeckCustomerProfile,
} from "@/lib/mealdeck-customer";
import {
  exportMealDeckCustomerData,
  initializeMealDeckCustomerClient,
  readCustomerCapabilities,
  readMealDeckCustomerAccount,
  registerMealDeckCustomer,
  requestCustomerEmail,
  signOutMealDeckCustomer,
  subscribeMealDeckCustomerAuth,
  updateMealDeckCustomer,
  verifyCustomerEmailCode,
  type CustomerAccountState,
} from "@/lib/mealdeck-customer-browser";
import { getMealDeckCustomerPushConfig } from "@/lib/mealdeck-customer.functions";
import {
  disableCustomerDeviceNotifications,
  enableCustomerDeviceNotifications,
  readCustomerDeviceNotifications,
  type CustomerDeviceNotifications,
} from "@/lib/mealdeck-customer-notifications";

function errorMessage(reason: unknown) {
  return reason instanceof CustomerAccountError
    ? reason.message
    : "We could not connect just now. Please try again.";
}

function Preferences({
  value,
  onChange,
  disabled = false,
}: {
  value: CustomerPreferences;
  onChange: (next: CustomerPreferences) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="md-account-preferences" disabled={disabled}>
      <legend>
        Make it your deck <span>Optional</span>
      </legend>
      <p>
        As a registered member, choose what you hear from MealDeck, a trading name of 313 Brands
        Ltd. Offer emails and app alerts need your separate opt-in. You can change these choices at
        any time.
      </p>
      <label>
        <input
          type="checkbox"
          checked={value.emailMarketing}
          onChange={(event) => onChange({ ...value, emailMarketing: event.target.checked })}
        />
        <span>
          <strong>Offers by email</strong>
          <small>Send me MealDeck promotions, loyalty offers and menu news by email.</small>
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.pushMarketing}
          onChange={(event) => onChange({ ...value, pushMarketing: event.target.checked })}
        />
        <span>
          <strong>Offers in the app</strong>
          <small>
            Send me promotional push notifications. This needs a separate device permission.
          </small>
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.orderNotifications}
          onChange={(event) => onChange({ ...value, orderNotifications: event.target.checked })}
        />
        <span>
          <strong>Order progress alerts</strong>
          <small>
            Use push notifications for updates about my orders. These are separate from promotions.
          </small>
        </span>
      </label>
      <p className="md-account-fine">
        Marketing is never required for registration, the opening offer or loyalty membership.
        Essential verification and order messages are separate.
      </p>
    </fieldset>
  );
}

function ContactFields({
  name,
  phone,
  setName,
  setPhone,
  disabled,
}: {
  name: string;
  phone: string;
  setName: (value: string) => void;
  setPhone: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <label className="md-account-field">
        Your name
        <input
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
          disabled={disabled}
        />
      </label>
      <label className="md-account-field">
        Phone number
        <input
          name="tel"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="e.g. 07700 900123"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          maxLength={40}
          disabled={disabled}
          aria-describedby="account-phone-help"
        />
        <small id="account-phone-help">
          So we can contact you about your order. This does not sign you up for texts or calls about
          offers.
        </small>
      </label>
    </>
  );
}

function CustomerEntry({
  onRequest,
  busy,
}: {
  onRequest: (email: string, registration?: CustomerRegistration) => Promise<void>;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"register" | "signin">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferences, setPreferences] = useState<CustomerPreferences>({
    ...EMPTY_CUSTOMER_PREFERENCES,
  });
  return (
    <section className="md-account-panel" aria-labelledby="account-entry-heading">
      <div className="md-account-tabs" aria-label="Account action">
        <button
          type="button"
          aria-pressed={mode === "register"}
          disabled={busy}
          onClick={() => setMode("register")}
        >
          Register
        </button>
        <button
          type="button"
          aria-pressed={mode === "signin"}
          disabled={busy}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
      </div>
      <h2 id="account-entry-heading">
        {mode === "register" ? "Your seat at the table." : "Welcome back."}
      </h2>
      <p>
        {mode === "register"
          ? "Create your account and verify your email for member offers and optional offer alerts. Guest ordering is also available during our opening hours on 6–8 November."
          : "We’ll email you a secure sign-in link. No password to remember."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onRequest(
            email,
            mode === "register" ? { name, email, phone, preferences } : undefined,
          );
        }}
      >
        {mode === "register" && (
          <ContactFields
            name={name}
            phone={phone}
            setName={setName}
            setPhone={setPhone}
            disabled={busy}
          />
        )}
        <label className="md-account-field">
          Email address
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            disabled={busy}
          />
          <small>We’ll send a verification link to this address.</small>
        </label>
        {mode === "register" && (
          <Preferences value={preferences} onChange={setPreferences} disabled={busy} />
        )}
        <p className="md-account-fine">
          We ask for an address only when you choose delivery. See how we use your details in our{" "}
          <a href="/privacy">privacy notice</a>.
        </p>
        <button className="md-account-primary" type="submit" disabled={busy}>
          <Mail size={18} aria-hidden="true" />{" "}
          {busy ? "Sending…" : mode === "register" ? "Verify my email" : "Email me a sign-in link"}
        </button>
      </form>
    </section>
  );
}

function CheckEmail({
  email,
  busy,
  resendAt,
  onResend,
  onVerify,
  onBack,
}: {
  email: string;
  busy: boolean;
  resendAt: number;
  onResend: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  return (
    <section className="md-account-panel md-account-email" aria-labelledby="account-email-heading">
      <span className="md-account-icon">
        <Mail size={26} aria-hidden="true" />
      </span>
      <h2 id="account-email-heading">Check your inbox.</h2>
      <p>
        If this address can receive a sign-in email, a secure link is on its way to{" "}
        <strong className="md-account-email-address">{email}</strong>.
      </p>
      <p>Open the link on this device to verify your email. Check your spam folder too.</p>
      <details className="md-account-code">
        <summary>My email includes a verification code</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onVerify(code);
          }}
        >
          <label className="md-account-field">
            Email code
            <input
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              minLength={6}
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              required
              disabled={busy}
            />
          </label>
          <button type="submit" className="md-account-primary" disabled={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
      </details>
      <div className="md-account-actions">
        <button
          type="button"
          className="md-account-secondary"
          disabled={busy || seconds > 0}
          onClick={() => void onResend()}
        >
          {seconds > 0 ? `Resend in ${seconds}s` : "Send another email"}
        </button>
        <button type="button" className="md-account-text" disabled={busy} onClick={onBack}>
          Use a different email
        </button>
      </div>
    </section>
  );
}

function FinishRegistration({
  account,
  busy,
  onFinish,
}: {
  account: Extract<CustomerAccountState, { status: "signed_in" }>;
  busy: boolean;
  onFinish: (details: CustomerRegistration) => Promise<void>;
}) {
  const [name, setName] = useState(account.suggestedName);
  const [phone, setPhone] = useState(account.suggestedPhone);
  const [preferences, setPreferences] = useState<CustomerPreferences>({
    ...EMPTY_CUSTOMER_PREFERENCES,
  });
  return (
    <section className="md-account-panel" aria-labelledby="account-finish-heading">
      <span className="md-account-verified">
        <ShieldCheck size={17} aria-hidden="true" /> Email verified
      </span>
      <h2 id="account-finish-heading">One last step.</h2>
      <p>Confirm your contact details to finish joining MealDeck.</p>
      <p className="md-account-email-address">{account.profile.email}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onFinish({ name, phone, email: account.profile.email, preferences });
        }}
      >
        <ContactFields
          name={name}
          phone={phone}
          setName={setName}
          setPhone={setPhone}
          disabled={busy}
        />
        <Preferences value={preferences} onChange={setPreferences} disabled={busy} />
        <p className="md-account-fine">
          By completing registration, you acknowledge our <a href="/privacy">privacy notice</a>.
          Your optional communication choices do not affect the opening offer.
        </p>
        <button type="submit" className="md-account-primary" disabled={busy}>
          {busy ? "Saving…" : "Finish registration"}
          <Check size={18} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}

function CustomerSettings({
  profile,
  capabilities,
  pushPublicKey,
  onSaved,
  onError,
  onMessage,
}: {
  profile: MealDeckCustomerProfile;
  capabilities: CustomerCapabilities;
  pushPublicKey: string | null;
  onSaved: (profile: MealDeckCustomerProfile) => void;
  onError: (reason: unknown) => void;
  onMessage: (value: string) => void;
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [preferences, setPreferences] = useState({ ...profile.preferences });
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<CustomerDeviceNotifications>("off");
  const [deviceLoading, setDeviceLoading] = useState(true);
  const pushReady = capabilities.pushReady && Boolean(pushPublicKey);
  const preferencesChanged = (Object.keys(preferences) as (keyof CustomerPreferences)[]).some(
    (key) => preferences[key] !== profile.preferences[key],
  );
  useEffect(() => {
    let active = true;
    void readCustomerDeviceNotifications()
      .then((value) => {
        if (active) setDevice(value);
      })
      .catch(() => {
        if (active) setDevice("off");
      })
      .finally(() => {
        if (active) setDeviceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profile.updatedAt]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await updateMealDeckCustomer(profile, {
        name,
        phone,
        email: profile.email,
        preferences,
      });
      if (!preferences.pushMarketing && !preferences.orderNotifications) {
        await disableCustomerDeviceNotifications().catch(() => {});
        setDevice("off");
      }
      onSaved(saved);
      onMessage("Your details and preferences are saved.");
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function changeDevice(enable: boolean) {
    setBusy(true);
    try {
      if (enable && pushPublicKey) await enableCustomerDeviceNotifications(pushPublicKey);
      else await disableCustomerDeviceNotifications();
      setDevice(enable ? "connected" : "off");
      onMessage(
        enable
          ? "This device is connected for the notification types you chose."
          : "Notifications are off on this device.",
      );
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    setBusy(true);
    try {
      const data = await exportMealDeckCustomerData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "mealdeck-account.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onMessage("Your account details and communication history have been downloaded.");
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="md-account-panel" aria-labelledby="account-details-heading">
        <div className="md-account-section-heading">
          <UserRound size={20} aria-hidden="true" />
          <h2 id="account-details-heading">Your details</h2>
        </div>
        <p className="md-account-email-address">
          {profile.email}{" "}
          <span className="md-account-verified">
            <Check size={15} aria-hidden="true" /> Verified
          </span>
        </p>
        <form onSubmit={(event) => void save(event)}>
          <ContactFields
            name={name}
            phone={phone}
            setName={setName}
            setPhone={setPhone}
            disabled={busy}
          />
          <Preferences value={preferences} onChange={setPreferences} disabled={busy} />
          <button type="submit" className="md-account-primary" disabled={busy}>
            {busy ? "Saving…" : "Save details & preferences"}
            <Check size={18} aria-hidden="true" />
          </button>
        </form>
      </section>
      <section className="md-account-panel" aria-labelledby="account-device-heading">
        <div className="md-account-section-heading">
          <Bell size={21} aria-hidden="true" />
          <h2 id="account-device-heading">Notifications on this device</h2>
        </div>
        <p>
          {device === "connected"
            ? "Connected. You’ll receive only the types of notification saved in your preferences."
            : device === "blocked"
              ? "Your browser is blocking notifications. You can allow them in your browser settings."
              : device === "unsupported"
                ? "On iPhone or iPad, install MealDeck on your home screen and open the app to enable notifications. Some browsers do not support them."
                : !pushReady
                  ? "App notifications are coming soon. Your communication choices are saved separately, and no device permission is requested yet."
                  : "Allow this device to receive the notification types you choose. You can turn them off at any time."}
        </p>
        {device === "connected" ? (
          <button
            type="button"
            className="md-account-secondary"
            disabled={busy}
            onClick={() => void changeDevice(false)}
          >
            Turn off on this device
          </button>
        ) : pushReady ? (
          <>
            <button
              type="button"
              className="md-account-primary"
              disabled={
                busy ||
                deviceLoading ||
                device === "blocked" ||
                device === "unsupported" ||
                preferencesChanged ||
                (!profile.preferences.pushMarketing && !profile.preferences.orderNotifications)
              }
              onClick={() => void changeDevice(true)}
            >
              <Bell size={18} aria-hidden="true" /> Allow notifications
            </button>
            {(preferencesChanged ||
              (!profile.preferences.pushMarketing && !profile.preferences.orderNotifications)) && (
              <p className="md-account-fine">
                Choose and save an app notification type above first.
              </p>
            )}
          </>
        ) : (
          <span className="md-account-soon">Coming soon</span>
        )}
      </section>
      <section
        className="md-account-panel md-account-privacy"
        aria-labelledby="account-privacy-heading"
      >
        <h2 id="account-privacy-heading">Your data, your choice.</h2>
        <p>
          Change your details or withdraw your marketing choices above. Download the contact details
          and communication choices held in your account.
        </p>
        <button
          type="button"
          className="md-account-secondary"
          disabled={busy}
          onClick={() => void exportData()}
        >
          Download my account data
        </button>
        <p className="md-account-fine">
          For account deletion, email changes or a full data request,{" "}
          <a href="mailto:info@mealdeck.co.uk">contact MealDeck</a>. Read our{" "}
          <a href="/privacy">privacy notice</a>.
        </p>
      </section>
    </>
  );
}

export function CustomerAccount({ returnTo = "/menus" }: { returnTo?: "/menus" | "/checkout" }) {
  const [account, setAccount] = useState<CustomerAccountState>({ status: "signed_out" });
  const [capabilities, setCapabilities] = useState<CustomerCapabilities | null>(null);
  const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomerRegistration | undefined>();
  const [resendAt, setResendAt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const acting = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);

  const showError = useCallback((reason: unknown) => {
    setError(errorMessage(reason));
    setMessage("");
  }, []);
  const showMessage = useCallback((value: string) => {
    setMessage(value);
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    async function refresh() {
      try {
        const next = await readMealDeckCustomerAccount();
        if (active) {
          setAccount(next);
          if (next.status === "signed_in") setEmailPending(null);
        }
      } catch (reason) {
        if (active) showError(reason);
      }
    }
    void (async () => {
      setLoading(true);
      setConnectionError("");
      try {
        await initializeMealDeckCustomerClient(attempt > 0);
        const [ready, push] = await Promise.all([
          readCustomerCapabilities(),
          getMealDeckCustomerPushConfig(),
        ]);
        if (!active) return;
        setCapabilities(ready);
        setPushPublicKey(push.publicKey);
        await refresh();
        if (active)
          unsubscribe = subscribeMealDeckCustomerAuth(() => {
            if (!acting.current) void refresh();
          });
      } catch (reason) {
        if (active) setConnectionError(errorMessage(reason));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt, showError]);

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  async function run(action: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (reason) {
      showError(reason);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  async function request(email: string, details?: CustomerRegistration) {
    await run(async () => {
      const clean = details ? validateCustomerRegistration(details) : undefined;
      await requestCustomerEmail(email, clean, returnTo);
      setEmailPending(email.trim().toLowerCase());
      setDraft(clean);
      setResendAt(Date.now() + 60000);
    });
  }

  async function finish(details: CustomerRegistration) {
    await run(async () => {
      const profile = await registerMealDeckCustomer(details);
      setAccount({ status: "signed_in", profile, suggestedName: "", suggestedPhone: "" });
      setDraft(undefined);
      showMessage(
        "You’re registered. Your verified account is ready for eligible MealDeck offers.",
      );
    });
  }

  async function verify(code: string) {
    if (!emailPending) return;
    await run(async () => {
      await verifyCustomerEmailCode(emailPending, code);
      if (draft) await registerMealDeckCustomer(draft);
      setAccount(await readMealDeckCustomerAccount());
      setEmailPending(null);
      setDraft(undefined);
      showMessage("Your email is verified.");
    });
  }

  async function signOut() {
    await run(async () => {
      // Revoking this browser's push endpoint prevents shared-device messages
      // after sign-out. A local unsubscribe is attempted even without a network.
      let notificationIssue = "";
      try {
        await disableCustomerDeviceNotifications();
      } catch (reason) {
        notificationIssue = errorMessage(reason);
      }
      await signOutMealDeckCustomer();
      setAccount({ status: "signed_out" });
      setEmailPending(null);
      setDraft(undefined);
      showMessage(notificationIssue || "You’ve signed out of your MealDeck account.");
    });
  }

  const signedIn = account.status === "signed_in";
  const profile = signedIn ? account.profile : null;
  return (
    <div className="md-account-page">
      <header className="md-account-header">
        <a href="/" aria-label="MealDeck home">
          <MealDeckLogo className="md-account-logo" />
        </a>
        <a href="/menus">
          <ArrowLeft size={16} aria-hidden="true" /> Back to menus
        </a>
      </header>
      <main className="md-account-main">
        <div className="md-account-intro">
          <span className="md-account-eyebrow">YOUR MEALDECK</span>
          <h1>
            {profile?.registered
              ? `Good to see you, ${profile.name?.split(" ")[0]}.`
              : "Good food. Your kind of perks."}
          </h1>
          <p>
            {profile?.registered
              ? "Your details, your preferences and a place in the MealDeck family."
              : "One account for all your favourite brands. Verify your email and get ready for the Luton launch."}
          </p>
          {signedIn && (
            <button
              type="button"
              className="md-account-text"
              onClick={() => void signOut()}
              disabled={busy}
            >
              <LogOut size={17} aria-hidden="true" /> Sign out
            </button>
          )}
          {profile?.registered && returnTo === "/checkout" && (
            <a className="md-account-primary md-account-return" href="/checkout">
              Continue to checkout
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          )}
        </div>
        {error && (
          <div
            ref={alertRef}
            className="md-account-notice md-account-error"
            role="alert"
            tabIndex={-1}
          >
            {error}
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Reload account
            </button>
          </div>
        )}
        {message && (
          <div className="md-account-notice" role="status">
            <Check size={18} aria-hidden="true" />
            {message}
          </div>
        )}
        <div className="md-account-layout">
          <div className="md-account-content">
            {loading ? (
              <section className="md-account-panel" aria-busy="true">
                <p role="status">Connecting to your MealDeck account…</p>
              </section>
            ) : connectionError ? (
              <section className="md-account-panel">
                <h2>We’re getting your account ready.</h2>
                <p>{connectionError}</p>
                <button
                  type="button"
                  className="md-account-secondary"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try again
                </button>
                <a href="/menus" className="md-account-text">
                  Keep exploring the menus
                  <ChevronRight size={17} aria-hidden="true" />
                </a>
              </section>
            ) : profile?.registered && capabilities ? (
              <CustomerSettings
                key={profile.updatedAt}
                profile={profile}
                capabilities={capabilities}
                pushPublicKey={pushPublicKey}
                onSaved={(next) =>
                  setAccount({
                    status: "signed_in",
                    profile: next,
                    suggestedName: "",
                    suggestedPhone: "",
                  })
                }
                onError={showError}
                onMessage={showMessage}
              />
            ) : signedIn ? (
              <FinishRegistration account={account} busy={busy} onFinish={finish} />
            ) : emailPending ? (
              <CheckEmail
                email={emailPending}
                busy={busy}
                resendAt={resendAt}
                onResend={() => request(emailPending, draft)}
                onVerify={verify}
                onBack={() => {
                  setEmailPending(null);
                  setDraft(undefined);
                }}
              />
            ) : account.status === "unverified" ? (
              <section className="md-account-panel">
                <h2>Verify your email first.</h2>
                <p>Use a fresh sign-in email to verify your address and complete registration.</p>
                <button
                  type="button"
                  className="md-account-primary"
                  disabled={busy}
                  onClick={() => void request(account.email)}
                >
                  Send verification email
                </button>
              </section>
            ) : (
              <CustomerEntry busy={busy} onRequest={request} />
            )}
          </div>
          <aside className="md-account-aside" aria-label="Your orders and member benefits">
            {profile?.registered && <CustomerOrders key={profile.userId} />}
            <section className="md-account-benefit">
              <Gift size={25} aria-hidden="true" />
              <span className="md-account-eyebrow">OPENING WEEKEND</span>
              <h2>30% off everything.</h2>
              <p>
                6–8 November 2026, during opening hours. No minimum order. Luton collection or
                kerbside pickup, for guests and registered members.
              </p>
              <p className="md-account-fine">
                Check <a href="/opening-offer">offer dates and details</a>. The discount applies
                automatically when the offer is live and your order is eligible. Marketing choices
                are optional. Guest orders earn no loyalty points.
              </p>
              <a href="/menus">
                Explore the menus
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            </section>
            <section
              className="md-account-panel md-account-loyalty"
              aria-labelledby="account-loyalty-heading"
            >
              <div className="md-account-section-heading">
                <Gift size={20} aria-hidden="true" />
                <h2 id="account-loyalty-heading">Loyalty, dealt your way.</h2>
              </div>
              {profile?.loyalty.enabled ? (
                <>
                  <strong className="md-account-points">
                    {profile.loyalty.points.toLocaleString("en-GB")} <span>points</span>
                  </strong>
                  <p>{profile.loyalty.terms}</p>
                </>
              ) : (
                <>
                  <span className="md-account-soon">Coming soon</span>
                  <p>
                    Registered customers will be able to collect loyalty points. We’ll publish how
                    to earn and use them before the programme starts.
                  </p>
                </>
              )}
              <p className="md-account-fine">
                Guest orders earn no loyalty points. No marketing opt-in is needed for loyalty
                membership.
              </p>
            </section>
            <section className="md-account-panel md-account-app">
              <div className="md-account-section-heading">
                <Smartphone size={20} aria-hidden="true" />
                <h2>Keep your deck close.</h2>
              </div>
              <PwaInstallCard />
            </section>
          </aside>
        </div>
        <footer className="md-account-footer">
          <span>MealDeck is a trading name of 313 Brands Ltd.</span>
          <a href="/privacy">Privacy & your choices</a>
          <span>Powered by Dishbee</span>
        </footer>
      </main>
    </div>
  );
}
