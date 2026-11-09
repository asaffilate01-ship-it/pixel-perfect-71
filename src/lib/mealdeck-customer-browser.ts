import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getMealDeckPublicBackend } from "./mealdeck-backend.functions";
import { getMealDeckCustomerEntryPolicy } from "./mealdeck-customer.functions";
import { createMealDeckBackendClientCache } from "./mealdeck-backend-client-cache";
import { customerEmailReturnPath, type CustomerReturnTarget } from "./mealdeck-customer-return";
import {
  CUSTOMER_CONSENT_VERSION,
  CUSTOMER_PRIVACY_VERSION,
  CustomerAccountError,
  normalizeCustomerEmail,
  parseCustomerCapabilities,
  parseCustomerProfile,
  validateCustomerRegistration,
  type CustomerCapabilities,
  type CustomerRegistration,
  type MealDeckCustomerProfile,
} from "./mealdeck-customer";

/** Separate browser session from staff operations, using the same dedicated project. */
const clients = createMealDeckBackendClientCache<SupabaseClient>({
  read: () => getMealDeckPublicBackend(),
  create: ({ url, publishableKey }) =>
    createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: `mealdeck-customer-${new URL(url).hostname}-auth-token`,
      },
      global: { headers: { "X-Client-Info": "mealdeck-customer-web" } },
    }),
  retire: (client) => {
    void client.auth.stopAutoRefresh().catch(() => {});
  },
});

export async function initializeMealDeckCustomerClient(refresh = false): Promise<SupabaseClient> {
  if (typeof window === "undefined") throw new Error("mealdeck_customer_browser_only");
  try {
    return await clients.initialise(refresh);
  } catch {
    throw new CustomerAccountError(
      "unconfigured",
      "Registration is being prepared. Your basket is safe — please try again shortly.",
    );
  }
}

export function resetMealDeckCustomerClient() {
  clients.reset();
}

function currentClient(): SupabaseClient {
  const client = clients.get();
  if (!client)
    throw new CustomerAccountError("unavailable", "Reconnect to your account and try again.");
  return client;
}

/** Translate reviewed errors without exposing database internals or account enumeration. */
export function customerRequestError(error: unknown): CustomerAccountError {
  const details = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = typeof details["code"] === "string" ? details["code"] : "";
  const message = typeof details["message"] === "string" ? details["message"] : "";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    details["status"] === 429
  )
    return new CustomerAccountError(
      "rate_limited",
      "Please wait a minute before requesting another email.",
    );
  if (/registration_deferred/.test(message))
    return new CustomerAccountError(
      "unavailable",
      "Email registration is available. Reload and try again; your email must still be verified.",
    );
  if (/email_verification_required/.test(message))
    return new CustomerAccountError("unverified", "Verify your email to finish your registration.");
  if (/profile_conflict/.test(message))
    return new CustomerAccountError(
      "conflict",
      "Your details changed on another screen. Reload your account before saving again.",
    );
  if (code === "PGRST202" || /push_unavailable/.test(message))
    return new CustomerAccountError(
      "unconfigured",
      "This account feature is being prepared. Please try again shortly.",
    );
  if (/subscription_conflict|subscription_limit/.test(message))
    return new CustomerAccountError(
      "conflict",
      "Notifications could not be connected to this device. Disable this device’s notifications, then try again.",
    );
  if (/invalid_profile|invalid_subscription|push_preference_required/.test(message))
    return new CustomerAccountError(
      "invalid",
      "Check your details and communication choices, then try again.",
    );
  if (
    code === "otp_expired" ||
    code === "otp_disabled" ||
    /token.*expired|invalid.*token/.test(message)
  )
    return new CustomerAccountError(
      "invalid",
      "That email link or code has expired or was already used. Request a new one.",
    );
  if (
    code === "PGRST301" ||
    code === "PGRST302" ||
    code === "42501" ||
    /unauthenticated|session.*missing|jwt.*expired/.test(message)
  )
    return new CustomerAccountError("unauthenticated", "Sign in again to continue.");
  return new CustomerAccountError(
    "unavailable",
    "We could not complete that request. Check your connection and try again.",
  );
}

export async function customerRpc<T>(
  name: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const client = currentClient();
  const { data, error } = await client.rpc(name, parameters);
  if (clients.get() !== client)
    throw new CustomerAccountError(
      "unauthenticated",
      "Your account connection changed. Sign in again to continue.",
    );
  if (error) throw customerRequestError(error);
  return data as T;
}

export async function readCustomerCapabilities(): Promise<CustomerCapabilities> {
  const response = parseCustomerCapabilities(await customerRpc("mealdeck_customer_capabilities"));
  if (!response)
    throw new CustomerAccountError(
      "unconfigured",
      "Registration is being prepared. Please try again shortly.",
    );
  return response;
}

export type CustomerAccountState =
  | { status: "signed_out" }
  | { status: "unverified"; email: string }
  | {
      status: "signed_in";
      profile: MealDeckCustomerProfile;
      suggestedName: string;
      suggestedPhone: string;
    };

function isMissingSession(
  error: {
    name?: string | undefined;
    code?: string | undefined;
    message?: string | undefined;
  } | null,
) {
  return error?.name === "AuthSessionMissingError" || error?.code === "session_not_found";
}

export async function readMealDeckCustomerAccount(): Promise<CustomerAccountState> {
  const client = currentClient();
  // getUser performs an Auth-server lookup. A decoded browser session is not
  // trusted proof of email verification or eligibility for an offer.
  const { data, error } = await client.auth.getUser();
  if (clients.get() !== client)
    throw new CustomerAccountError(
      "unauthenticated",
      "Your account connection changed. Please sign in again.",
    );
  if (isMissingSession(error) || (!error && !data.user)) return { status: "signed_out" };
  if (error) throw customerRequestError(error);
  const user = data.user!;
  if (!user.email_confirmed_at || user.is_anonymous || !user.email)
    return { status: "unverified", email: user.email ?? "" };
  const profile = parseCustomerProfile(await customerRpc("mealdeck_customer_profile_with_messages"));
  if (!profile || profile.userId !== user.id)
    throw new CustomerAccountError(
      "unavailable",
      "We could not verify your account details. Please reload and try again.",
    );
  // Metadata only prefills an editable form. It never completes registration,
  // changes saved preferences, verifies email or grants any permission.
  const suggestions = user.user_metadata as Record<string, unknown>;
  return {
    status: "signed_in",
    profile,
    suggestedName:
      typeof suggestions["mealdeck_name"] === "string"
        ? suggestions["mealdeck_name"].slice(0, 120)
        : "",
    suggestedPhone:
      typeof suggestions["mealdeck_phone"] === "string"
        ? suggestions["mealdeck_phone"].slice(0, 40)
        : "",
  };
}

export async function requestCustomerEmail(
  emailInput: string,
  registration?: CustomerRegistration,
  returnTo: CustomerReturnTarget = "/menus",
): Promise<void> {
  const email = normalizeCustomerEmail(emailInput);
  if (!email) throw new CustomerAccountError("invalid", "Enter a valid email address.");
  const details = registration ? validateCustomerRegistration(registration) : null;
  if (details && details.email !== email)
    throw new CustomerAccountError("invalid", "Review your email address before continuing.");
  await readCustomerCapabilities();
  if (details && (await getMealDeckCustomerEntryPolicy()).emailRegistrationDeferred)
    throw new CustomerAccountError(
      "unavailable",
      "Email registration is available. Reload and try again; your email must still be verified.",
    );
  const { error } = await currentClient().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: Boolean(details),
      emailRedirectTo: new URL(customerEmailReturnPath(returnTo), window.location.origin).href,
      ...(details ? { data: { mealdeck_name: details.name, mealdeck_phone: details.phone } } : {}),
    },
  });
  if (error) throw customerRequestError(error);
}

/** Password sign-in for accounts that already have one (e.g. owner-provisioned test customers). */
export async function signInMealDeckCustomerWithPassword(
  emailInput: string,
  password: string,
): Promise<void> {
  const email = normalizeCustomerEmail(emailInput);
  if (!email || !password)
    throw new CustomerAccountError("invalid", "Enter your email address and password.");
  await readCustomerCapabilities();
  const { error } = await currentClient().auth.signInWithPassword({ email, password });
  if (error)
    throw new CustomerAccountError(
      "invalid",
      "That email and password didn’t match. Try again or use an email sign-in link.",
    );
}

export async function verifyCustomerEmailCode(emailInput: string, token: string): Promise<User> {
  const email = normalizeCustomerEmail(emailInput);
  if (!email || !/^\d{6,8}$/.test(token.trim()))
    throw new CustomerAccountError("invalid", "Enter the verification code from your email.");
  const { data, error } = await currentClient().auth.verifyOtp({
    email,
    token: token.trim(),
    type: "email",
  });
  if (error) throw customerRequestError(error);
  if (!data.user?.email_confirmed_at)
    throw new CustomerAccountError(
      "unverified",
      "Your email could not be verified. Please request another email.",
    );
  return data.user;
}

function acceptedProfile(value: unknown): MealDeckCustomerProfile {
  const profile = parseCustomerProfile(value);
  if (!profile?.registered)
    throw new CustomerAccountError(
      "unavailable",
      "Your account details could not be saved. Please try again.",
    );
  return profile;
}

export async function registerMealDeckCustomer(
  details: CustomerRegistration,
): Promise<MealDeckCustomerProfile> {
  const clean = validateCustomerRegistration(details);
  if ((await getMealDeckCustomerEntryPolicy()).emailRegistrationDeferred)
    throw new CustomerAccountError(
      "unavailable",
      "Email registration is available. Reload your account page to try again.",
    );
  return acceptedProfile(
    await customerRpc("mealdeck_customer_register_with_messages", {
      p_name: clean.name,
      p_phone: clean.phone,
      p_email_marketing: clean.preferences.emailMarketing,
      p_push_marketing: clean.preferences.pushMarketing,
      p_order_notifications: clean.preferences.orderNotifications,
      p_privacy_version: CUSTOMER_PRIVACY_VERSION,
      p_consent_version: CUSTOMER_CONSENT_VERSION,
      p_sms_marketing: clean.preferences.smsMarketing === true,
      p_whatsapp_marketing: clean.preferences.whatsappMarketing === true,
    }),
  );
}

export async function updateMealDeckCustomer(
  profile: MealDeckCustomerProfile,
  details: CustomerRegistration,
): Promise<MealDeckCustomerProfile> {
  const clean = validateCustomerRegistration(details);
  return acceptedProfile(
    await customerRpc("mealdeck_customer_update_with_messages", {
      p_name: clean.name,
      p_phone: clean.phone,
      p_email_marketing: clean.preferences.emailMarketing,
      p_push_marketing: clean.preferences.pushMarketing,
      p_order_notifications: clean.preferences.orderNotifications,
      p_expected_updated_at: profile.updatedAt,
      p_consent_version: CUSTOMER_CONSENT_VERSION,
      p_sms_marketing: clean.preferences.smsMarketing === true,
      p_whatsapp_marketing: clean.preferences.whatsappMarketing === true,
    }),
  );
}

/** Transport only; checkout must verify this JWT with Auth and read current registration server-side. */
export async function getMealDeckCustomerAccessToken(): Promise<string | null> {
  const client = await initializeMealDeckCustomerClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw customerRequestError(error);
  return data.session?.access_token ?? null;
}

export function subscribeMealDeckCustomerAuth(listener: () => void): () => void {
  // Supabase callbacks run within its auth lock. Schedule subsequent Auth/RPC
  // reads after the callback returns instead of awaiting them in the callback.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const { data } = currentClient().auth.onAuthStateChange(() => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      listener();
    }, 0);
    timers.add(timer);
  });
  return () => {
    data.subscription.unsubscribe();
    timers.forEach(clearTimeout);
  };
}

export async function signOutMealDeckCustomer(): Promise<void> {
  const client = currentClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw customerRequestError(error);
}

export async function exportMealDeckCustomerData(): Promise<unknown> {
  return customerRpc("mealdeck_customer_export_with_messages");
}
