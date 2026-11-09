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
import { useCustomerEntryPolicy } from "./use-customer-entry-policy";
import { customerReturnTarget, type CustomerReturnTarget } from "@/lib/mealdeck-customer-return";
import {
  MEMBER_LOYALTY_RULES,
  MEMBER_LOYALTY_UNAVAILABLE_MESSAGE,
  memberLoyaltyView,
} from "@/lib/mealdeck-member-loyalty";
import {
  accountAfterAuthPath,
  hasAccountAuthCallback,
  showPublicGuestAccount,
} from "@/lib/mealdeck-account-entry";
import {
  CustomerAccountError,
  EMPTY_CUSTOMER_PREFERENCES,
  EMPTY_CUSTOMER_MESSAGE_PREFERENCES,
  validateCustomerRegistration,
  type CustomerMessagePreferences,
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
  signInMealDeckCustomerWithPassword,
  requestCustomerEmail,
  requestCustomerPasswordReset,
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
  messagePreferences,
  onMessageChange,
  disabled = false,
}: {
  value: CustomerPreferences;
  onChange: (next: CustomerPreferences) => void;
  messagePreferences: CustomerMessagePreferences;
  onMessageChange: (next: CustomerMessagePreferences) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      id="account-notification-choices"
      className="md-account-preferences"
      disabled={disabled}
      aria-describedby="account-choice-help"
    >
      <legend>
        Notification &amp; marketing choices <span>All optional</span>
      </legend>
      <p id="account-choice-help">
        Choose only what you want. All switches start off. We always send essential
        verification and order-confirmation messages, regardless of these options.
      </p>
      <p className="md-account-pref-group-title">Order updates</p>
      <label>
        <input
          type="checkbox"
          checked={value.orderNotifications}
          onChange={(event) => onChange({ ...value, orderNotifications: event.target.checked })}
        />
        <span>
          <strong>Order progress notifications</strong>
          <small>Get updates when your order is accepted, prepared or ready. App permission is required.</small>
        </span>
      </label>
      <p className="md-account-pref-group-title">Deals and offers</p>
      <label>
        <input
          type="checkbox"
          checked={value.emailMarketing}
          onChange={(event) => onChange({ ...value, emailMarketing: event.target.checked })}
        />
        <span>
          <strong>Offers by email</strong>
          <small>Receive occasional promotions and new menu announcements.</small>
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.pushMarketing}
          onChange={(event) => onChange({ ...value, pushMarketing: event.target.checked })}
        />
        <span>
          <strong>Offers as app notifications</strong>
          <small>You also need to enable notifications on this device after saving your choices.</small>
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={messagePreferences.smsMarketing}
          onChange={(event) =>
            onMessageChange({ ...messagePreferences, smsMarketing: event.target.checked })
          }
        />
        <span>
          <strong>Offers by SMS</strong>
          <small>Optional marketing texts to your saved mobile number when this channel is available.</small>
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={messagePreferences.whatsappMarketing}
          onChange={(event) =>
            onMessageChange({ ...messagePreferences, whatsappMarketing: event.target.checked })
          }
        />
        <span>
          <strong>Offers by WhatsApp</strong>
          <small>Optional marketing via WhatsApp when available. This choice does not verify WhatsApp ownership.</small>
        </span>
      </label>
      <p className="md-account-fine">
        These choices never affect membership or loyalty points. You can withdraw consent at
        any time. SMS and WhatsApp options do not themselves activate a message campaign.
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

function QuickCheckoutNotice({ returnTo }: { returnTo: CustomerReturnTarget }) {
  return (
    <section className="md-account-panel md-account-guest" aria-labelledby="account-guest-heading">
      <div className="md-account-icon">
        <UserRound size={26} aria-hidden="true" />
      </div>
      <h2 id="account-guest-heading">Just your name and WhatsApp number.</h2>
      <p>
        You can order without creating an account. Enter your name and contact number at checkout.
      </p>
      <a className="md-account-primary" href={returnTo === "/menus" ? "/checkout" : returnTo}>
        Continue without registering <ArrowRight size={18} aria-hidden="true" />
      </a>
      <p className="md-account-fine md-account-guest-note">
        Guests can place eligible orders, but loyalty points and member-only offers require a verified account.
      </p>
    </section>
  );
}

function CustomerEntry({
  onRequest,
  onPassword,
  onReset,
  busy,
  registrationDeferred,
  signInOnly,
}: {
  onRequest: (email: string, registration?: CustomerRegistration) => Promise<void>;
  onPassword: (email: string, password: string) => Promise<void>;
  onReset: (email: string) => Promise<void>;
  busy: boolean;
  registrationDeferred: boolean;
  signInOnly: boolean;
}) {
  const [requestedMode, setMode] = useState<"register" | "signin">("register");
  const mode = registrationDeferred || signInOnly ? "signin" : requestedMode;
  // Most MealDeck accounts are passwordless. Email-link sign-in is the default.
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <section className="md-account-panel" aria-labelledby="account-entry-heading">
      <div className="md-account-tabs" aria-label="Account action">
        {!registrationDeferred && !signInOnly && (
          <button
            type="button"
            aria-pressed={mode === "register"}
            disabled={busy}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        )}
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
        {mode === "register" ? "Create your MealDeck account" : "Sign in to MealDeck"}
      </h2>
      <p>
        {mode === "register"
          ? "Enter your details, verify your email, then choose optional updates. " +
            "Loyalty requires a verified account — no marketing permission is required."
          : usePassword
            ? "Sign in with your email and password."
            : "We’ll email you a secure sign-in link. No password needed."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "signin" && usePassword) {
            void onPassword(email, password);
            return;
          }
          void onRequest(
            email,
            mode === "register"
              ? {
                  name,
                  email,
                  phone,
                  preferences: { ...EMPTY_CUSTOMER_PREFERENCES },
                  messagePreferences: { ...EMPTY_CUSTOMER_MESSAGE_PREFERENCES },
                }
              : undefined,
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
          {!(mode === "signin" && usePassword) && (
            <small>We’ll send a verification link to this address.</small>
          )}
        </label>
        {mode === "signin" && usePassword && (
          <label className="md-account-field">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
              disabled={busy}
            />
          </label>
        )}
        {mode === "signin" && usePassword && (
          <button
            type="button"
            className="md-account-text"
            disabled={busy}
            onClick={() => void onReset(email)}
          >
            Forgot password?
          </button>
        )}
        {mode === "signin" && (
          <button
            type="button"
            className="md-account-text"
            disabled={busy}
            onClick={() => {
              setUsePassword((value) => !value);
              setPassword("");
            }}
          >
            {usePassword ? "Email me a sign-in link instead" : "Sign in with a password instead"}
          </button>
        )}
        {mode === "register" && (
          <p className="md-account-fine">
            Next: check your inbox and confirm your email. Then choose any order, email, app,
            SMS or WhatsApp updates. All marketing switches start off.
          </p>
        )}
        <p className="md-account-fine">
          We ask for an address only when you choose delivery. See how we use your details in our{" "}
          <a href="/privacy">privacy notice</a>.
        </p>
        <button className="md-account-primary" type="submit" disabled={busy}>
          <Mail size={18} aria-hidden="true" />{" "}
          {busy
            ? mode === "signin" && usePassword
              ? "Signing in…"
              : "Sending…"
            : mode === "register"
              ? "Send my verification email"
              : usePassword
                ? "Sign in"
                : "Email me a sign-in link"}
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
        We’ve requested a secure verification or sign-in email for{" "}
        <strong className="md-account-email-address">{email}</strong>.
      </p>
      <p>Step 1: open the newest MealDeck email. Step 2: choose Verify email, or enter its code below. Check spam or junk if needed.</p>
      <section className="md-account-code" aria-label="Enter verification code">
        <h3>Have a verification code?</h3>
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
              aria-label="Email verification code"
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
            {busy ? "Verifying…" : "Verify code and continue"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
      </section>
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
  initial,
  onFinish,
}: {
  account: Extract<CustomerAccountState, { status: "signed_in" }>;
  busy: boolean;
  initial?: CustomerRegistration;
  onFinish: (details: CustomerRegistration) => Promise<void>;
}) {
  const [name, setName] = useState(account.suggestedName || initial?.name || "");
  const [phone, setPhone] = useState(account.suggestedPhone || initial?.phone || "");
  const [preferences, setPreferences] = useState<CustomerPreferences>({
    ...EMPTY_CUSTOMER_PREFERENCES,
  });
  const [messages, setMessages] = useState<CustomerMessagePreferences>({
    ...EMPTY_CUSTOMER_MESSAGE_PREFERENCES,
  });
  return (
    <section className="md-account-panel" aria-labelledby="account-finish-heading">
      <span className="md-account-verified">
        <ShieldCheck size={17} aria-hidden="true" /> Email verified
      </span>
      <h2 id="account-finish-heading">Finish setting up your account</h2>
      <p>Your email is verified. Check your contact details, choose any notifications you want, then save. All marketing is optional.</p>
      <p className="md-account-email-address">{account.profile.email}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onFinish({ name, phone, email: account.profile.email, preferences, messagePreferences: messages });
        }}
      >
        <ContactFields
          name={name}
          phone={phone}
          setName={setName}
          setPhone={setPhone}
          disabled={busy}
        />
        <Preferences
          value={preferences}
          onChange={setPreferences}
          messagePreferences={messages}
          onMessageChange={setMessages}
          disabled={busy}
        />
        <p className="md-account-fine">
          By completing registration, you acknowledge our <a href="/privacy">privacy notice</a>.
          Your communication choices do not affect loyalty points or order eligibility.
        </p>
        <button type="submit" className="md-account-primary" disabled={busy}>
          {busy ? "Saving…" : "Save and finish registration"}
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
  const [messages, setMessages] = useState<CustomerMessagePreferences>({
    ...(profile.messagePreferences ?? EMPTY_CUSTOMER_MESSAGE_PREFERENCES),
  });
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<CustomerDeviceNotifications>("off");
  const [deviceLoading, setDeviceLoading] = useState(true);
  const pushReady = capabilities.pushReady && Boolean(pushPublicKey);
  const preferencesChanged =
    (Object.keys(preferences) as (keyof CustomerPreferences)[]).some(
      (key) => preferences[key] !== profile.preferences[key],
    ) ||
    messages.smsMarketing !== (profile.messagePreferences?.smsMarketing ?? false) ||
    messages.whatsappMarketing !== (profile.messagePreferences?.whatsappMarketing ?? false);
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
        messagePreferences: messages,
      });
      if (!preferences.pushMarketing && !preferences.orderNotifications) {
        await disableCustomerDeviceNotifications().catch(() => {});
        setDevice("off");
      }
      onSaved(saved);
      onMessage("Saved. Your account and notification choices are up to date.");
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
          <div className="md-account-section-heading" id="account-notifications-heading">
            <Bell size={20} aria-hidden="true" />
            <h2>Notifications and messages</h2>
          </div>
          <Preferences
            value={preferences}
            onChange={setPreferences}
            messagePreferences={messages}
            onMessageChange={setMessages}
            disabled={busy}
          />
          <button type="submit" className="md-account-primary" disabled={busy}>
            {busy ? "Saving…" : "Save my choices"}
            <Check size={18} aria-hidden="true" />
          </button>
        </form>
      </section>
      <section className="md-account-panel" aria-labelledby="account-device-heading">
        <div className="md-account-section-heading">
          <Bell size={21} aria-hidden="true" />
          <h2 id="account-device-heading">Enable app notifications</h2>
        </div>
        <p className="md-account-fine">Step 1: choose and save app or order alerts above. Step 2: allow notifications on your phone.</p>
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
              <Bell size={18} aria-hidden="true" /> Enable on this device
            </button>
            {(preferencesChanged ||
              (!profile.preferences.pushMarketing && !profile.preferences.orderNotifications)) && (
              <p className="md-account-fine">
                Choose app offers or order progress above, then select Save my choices before enabling this device.
              </p>
            )}
          </>
        ) : (
          <p role="status">This device is not ready for push notifications. Your preferences can still be saved.</p>
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

const LINK_FAILED =
  "That sign-in link didn’t work here. Links only work once, in the same browser that requested them. Use Sign in to request a new link, enter the code from your email, or sign in with a password.";

export function CustomerAccount({
  returnTo = "/menus",
  signInRequested = false,
}: {
  returnTo?: CustomerReturnTarget;
  signInRequested?: boolean;
}) {
  const returnTarget = customerReturnTarget(returnTo);
  const entryPolicy = useCustomerEntryPolicy();
  // A missing status response must not hide registration and loyalty behind a guest-only page.
  // Database/Auth remains the sole authority to accept any new registration.
  const registrationDeferred = entryPolicy?.emailRegistrationDeferred === true;
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
  const [authCallback, setAuthCallback] = useState(false);
  const callbackSeen = useRef(false);
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
    let linkFailed = false;
    async function refresh() {
      try {
        const next = await readMealDeckCustomerAccount();
        if (active) {
          setAccount(next);
          if (next.status === "signed_in") setEmailPending(null);
        }
        return next.status;
      } catch (reason) {
        if (active)
          showError(linkFailed ? new CustomerAccountError("invalid", LINK_FAILED) : reason);
        return null;
      }
    }
    if (hasAccountAuthCallback(window.location.search, window.location.hash)) {
      callbackSeen.current = true;
      setAuthCallback(true);
    }
    const arrivedFromEmailLink = attempt === 0 && callbackSeen.current;
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
        const status = await refresh();
        // An email link that couldn't sign in (opened in another browser or app,
        // already used, or expired) used to land silently on Register.
        if (active && arrivedFromEmailLink) {
          if (status !== "signed_in") linkFailed = true;
          if (linkFailed) showError(new CustomerAccountError("invalid", LINK_FAILED));
          window.history.replaceState(null, "", accountAfterAuthPath(returnTarget));
        }
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
  }, [attempt, showError, returnTarget]);

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

  async function passwordReset(email: string) {
    await run(async () => {
      await requestCustomerPasswordReset(email);
      showMessage(
        "If that email has a MealDeck account, we’ve sent a link to reset your password. Check your inbox.",
      );
    });
  }

  async function passwordSignIn(email: string, password: string) {
    await run(async () => {
      await signInMealDeckCustomerWithPassword(email, password);
      setAccount(await readMealDeckCustomerAccount());
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
      setAccount(await readMealDeckCustomerAccount());
      setEmailPending(null);
      // Explicit choices and final registration occur only after verification.
      showMessage("Email verified. Review your details and choose updates to finish.");
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
  const loyaltyView = memberLoyaltyView(profile?.loyalty);
  const publicGuestView = showPublicGuestAccount({
    registrationDeferred,
    signInRequested,
    authCallback,
    signedIn,
    emailPending: emailPending !== null,
  });
  const signInOnly = signInRequested || authCallback;
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
              : publicGuestView
                ? "Order without an account."
                : signInOnly
                  ? "Sign in to MealDeck."
                  : "Good food. Your kind of perks."}
          </h1>
          <p>
            {profile?.registered
              ? "Your details, your preferences and a place in the MealDeck family."
              : publicGuestView
                ? "Every craving, one order. Choose your food and we’ll take the details we need at checkout."
                : signInOnly
                  ? "Use your verified account to continue."
                  : "One account for all your favourite brands. Verify your email to start earning loyalty points."}
          </p>
          {profile?.registered && (
            <nav className="md-account-quick-links" aria-label="Account shortcuts">
              <a href="#account-notification-choices">
                <Bell size={17} aria-hidden="true" /> Notification settings
              </a>
              <a href="#account-device-heading">
                <Smartphone size={17} aria-hidden="true" /> Enable on this device
              </a>
            </nav>
          )}
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
          {profile?.registered && returnTarget !== "/menus" && (
            <a className="md-account-primary md-account-return" href={returnTarget}>
              {returnTarget === "/group-order" ? "Return to group room" : "Continue to checkout"}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          )}
        </div>
        {error && !publicGuestView && (
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
            {publicGuestView ? (
              <QuickCheckoutNotice returnTo={returnTarget} />
            ) : loading ? (
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
              registrationDeferred ? (
                <QuickCheckoutNotice returnTo={returnTarget} />
              ) : (
                <FinishRegistration account={account} busy={busy} initial={draft} onFinish={finish} />
              )
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
              <CustomerEntry
                busy={busy}
                onRequest={request}
                onPassword={passwordSignIn}
                onReset={passwordReset}
                registrationDeferred={registrationDeferred}
                signInOnly={signInOnly}
              />
            )}
          </div>
          <aside
            className="md-account-aside"
            aria-label={
              publicGuestView
                ? "MealDeck membership and the app"
                : "Your orders and member benefits"
            }
          >
            {profile?.registered && <CustomerOrders key={profile.userId} />}
            <section className="md-account-benefit">
              <Gift size={25} aria-hidden="true" />
              <span className="md-account-eyebrow">MEALDECK MEMBERSHIP</span>
              <h2>Every order counts.</h2>
              <p>
                Verified members earn loyalty points on eligible paid orders and can see their
                recent MealDeck orders here.
              </p>
              <p className="md-account-fine">
                Choose which offer and order alerts you receive. Marketing choices are always
                optional. Guest orders earn no loyalty points.
              </p>
              <a href="/menus">
                Explore the menus
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            </section>
            {!publicGuestView && (
              <section
                className="md-account-panel md-account-loyalty"
                aria-labelledby="account-loyalty-heading"
              >
                <div className="md-account-section-heading">
                  <Gift size={20} aria-hidden="true" />
                  <h2 id="account-loyalty-heading">Loyalty, dealt your way.</h2>
                </div>
                {loyaltyView.kind === "live" ? (
                  <strong className="md-account-points">
                    {loyaltyView.pointsLabel} <span>points</span>
                  </strong>
                ) : profile ? (
                  <p className="md-account-loyalty-status" role="status">
                    {MEMBER_LOYALTY_UNAVAILABLE_MESSAGE}
                  </p>
                ) : (
                  <p className="md-account-loyalty-status">
                    Register or sign in to see your points balance.
                  </p>
                )}
                <p className="md-account-fine">
                  Verified registered members earn 1 point for each complete £1 actually paid after
                  discounts on eligible orders from 9 November 2026. Guest orders earn none. Refunds
                  and disputes adjust points.
                </p>
                <ul className="md-account-loyalty-rules">
                  {MEMBER_LOYALTY_RULES.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </section>
            )}
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
