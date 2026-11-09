/**
 * Sends MealDeck customer sign-up, sign-in and password-reset emails through
 * Resend from info@mealdeck.co.uk. Auth still issues and verifies every token;
 * this module only generates the link server-side and delivers it.
 */
import { createHash, randomBytes } from "node:crypto";
import { renderMealDeckAuthEmail } from "./mealdeck-auth-email-templates";
import { AUTH_EMAIL_SITE_ORIGIN } from "./mealdeck-auth-email-links";
import { customerEntryPolicy } from "./mealdeck-customer-entry";
import type { CustomerReturnTarget } from "./mealdeck-customer-return";
import {
  CUSTOMER_EMAIL_FROM,
  CUSTOMER_EMAIL_REPLY_TO,
  customerConfirmationLink,
  planCustomerEmail,
  type CustomerEmailKind,
  type ExistingAuthUser,
} from "./mealdeck-customer-email";

export type CustomerEmailInput = {
  kind: CustomerEmailKind;
  email: string;
  name?: string | undefined;
  phone?: string | undefined;
  returnTo: CustomerReturnTarget;
};
export type CustomerEmailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "no_account" | "cooldown" | "deferred" | "unavailable";
      retryAfterSeconds?: number;
    };

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
type Env = Readonly<Record<string, string | undefined>>;

function hostOf(value: string | undefined): string | null {
  try {
    return value ? new URL(value).host : null;
  } catch {
    return null;
  }
}

function adminHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_") && !key.startsWith("sb_publishable_"))
    headers["Authorization"] = `Bearer ${key}`;
  return headers;
}

async function findUser(url: string, key: string, email: string): Promise<ExistingAuthUser> {
  const response = await fetch(
    `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=50`,
    { headers: adminHeaders(key) },
  );
  if (!response.ok) throw new Error(`account_lookup_failed_${response.status}`);
  const body = (await response.json()) as { users?: Array<Record<string, unknown>> };
  const user = (body.users ?? []).find(
    (entry) => typeof entry["email"] === "string" && entry["email"].toLowerCase() === email,
  );
  if (!user || typeof user["id"] !== "string") return null;
  const app = (user["app_metadata"] ?? {}) as Record<string, unknown>;
  return {
    id: user["id"],
    confirmed: Boolean(user["email_confirmed_at"]),
    lastSentAt:
      typeof app["mealdeck_email_sent_at"] === "string" ? app["mealdeck_email_sent_at"] : null,
  };
}

async function sendThroughResend(
  env: Env,
  message: { to: string; subject: string; html: string; text: string; idempotencyKey: string },
) {
  const lovableKey = env["LOVABLE_API_KEY"];
  const resendKey = env["RESEND_API_KEY"];
  if (!lovableKey || !resendKey) throw new Error("resend_not_configured");
  const response = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
      "Idempotency-Key": message.idempotencyKey,
    },
    body: JSON.stringify({
      from: CUSTOMER_EMAIL_FROM,
      to: [message.to],
      reply_to: CUSTOMER_EMAIL_REPLY_TO,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`resend_failed_${response.status}: ${detail}`);
  }
}

export async function sendMealDeckCustomerEmail(
  input: CustomerEmailInput,
  env: Env,
): Promise<CustomerEmailResult> {
  const url = env["SUPABASE_URL"];
  const key = env["SUPABASE_SERVICE_ROLE_KEY"];
  // The customer app signs in against MEALDECK_SUPABASE_URL. Only send when the
  // privileged client points at that same Auth project; never mix projects.
  if (!url || !key || !hostOf(url) || hostOf(url) !== hostOf(env["MEALDECK_SUPABASE_URL"]))
    return { ok: false, reason: "unavailable" };
  if (input.kind === "register" && customerEntryPolicy().emailRegistrationDeferred)
    return { ok: false, reason: "deferred" };

  const user = await findUser(url, key, input.email);
  const plan = planCustomerEmail(input.kind, user, Date.now());
  if (plan.action === "skip") {
    // Reset requests never reveal whether an account exists.
    if (input.kind === "recovery" && plan.reason === "no_account") return { ok: true };
    return { ok: false, reason: plan.reason, ...(plan.retryAfterSeconds ? { retryAfterSeconds: plan.retryAfterSeconds } : {}) };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const metadata =
    input.kind === "register" && input.name && input.phone
      ? { mealdeck_name: input.name, mealdeck_phone: input.phone }
      : undefined;
  const generated =
    plan.linkType === "signup"
      ? await supabaseAdmin.auth.admin.generateLink({
          type: "signup",
          email: input.email,
          // Passwordless customers sign in by email; this random value is never shown.
          password: randomBytes(32).toString("base64url"),
          ...(metadata ? { options: { data: metadata } } : {}),
        })
      : await supabaseAdmin.auth.admin.generateLink({ type: plan.linkType, email: input.email });
  if (generated.error || !generated.data.properties?.hashed_token)
    throw new Error(`generate_link_failed: ${generated.error?.message ?? "missing token"}`);
  const { hashed_token: tokenHash, email_otp: code } = generated.data.properties;
  const userId = generated.data.user?.id ?? user?.id;

  const template = renderMealDeckAuthEmail(plan.linkType === "magiclink" ? "magiclink" : plan.linkType, {
    code,
    confirmationUrl: customerConfirmationLink(AUTH_EMAIL_SITE_ORIGIN, tokenHash, plan.linkType, input.returnTo),
  });
  await sendThroughResend(env, {
    to: input.email,
    ...template,
    idempotencyKey: createHash("sha256").update(`mealdeck-customer:${tokenHash}`).digest("hex"),
  });

  if (userId)
    await supabaseAdmin.auth.admin
      .updateUserById(userId, { app_metadata: { mealdeck_email_sent_at: new Date().toISOString() } })
      .catch(() => {});
  return { ok: true };
}
