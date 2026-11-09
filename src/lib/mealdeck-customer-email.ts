/**
 * Browser-safe rules for MealDeck customer account emails sent through Resend.
 * The server decides what to send; these helpers hold no secrets and send nothing.
 */
import { AUTH_CONFIRMATION_PATH, isAuthTokenHash } from "./mealdeck-auth-email-links";
import { customerEmailReturnPath, type CustomerReturnTarget } from "./mealdeck-customer-return";

export const CUSTOMER_EMAIL_FROM = "MealDeck <info@mealdeck.co.uk>";
export const CUSTOMER_EMAIL_REPLY_TO = "info@mealdeck.co.uk";
/** One account email per address per minute. */
export const CUSTOMER_EMAIL_COOLDOWN_MS = 60_000;

export type CustomerEmailKind = "register" | "signin" | "recovery";
export type CustomerVerifyType = "signup" | "magiclink" | "recovery";
export type ExistingAuthUser = { id: string; confirmed: boolean; lastSentAt: string | null } | null;

export type CustomerEmailPlan =
  | { action: "send"; linkType: CustomerVerifyType; createUser: boolean }
  | { action: "skip"; reason: "no_account" | "cooldown"; retryAfterSeconds?: number };

/**
 * - Register: new address → signup verification; unconfirmed → resend signup;
 *   confirmed → ordinary sign-in link (never a second account).
 * - Sign in: only existing accounts; never creates one.
 * - Recovery: only confirmed accounts; unknown addresses get the same neutral reply.
 */
export function planCustomerEmail(
  kind: CustomerEmailKind,
  user: ExistingAuthUser,
  now: number,
): CustomerEmailPlan {
  if (user?.lastSentAt) {
    const elapsed = now - Date.parse(user.lastSentAt);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < CUSTOMER_EMAIL_COOLDOWN_MS)
      return {
        action: "skip",
        reason: "cooldown",
        retryAfterSeconds: Math.ceil((CUSTOMER_EMAIL_COOLDOWN_MS - elapsed) / 1000),
      };
  }
  if (kind === "register") {
    if (!user) return { action: "send", linkType: "signup", createUser: true };
    return { action: "send", linkType: user.confirmed ? "magiclink" : "signup", createUser: false };
  }
  if (kind === "signin") {
    if (!user) return { action: "skip", reason: "no_account" };
    return { action: "send", linkType: user.confirmed ? "magiclink" : "signup", createUser: false };
  }
  if (!user || !user.confirmed) return { action: "skip", reason: "no_account" };
  return { action: "send", linkType: "recovery", createUser: false };
}

export function customerConfirmationLink(
  origin: string,
  tokenHash: string,
  type: CustomerVerifyType,
  returnTo: CustomerReturnTarget,
): string {
  const next = type === "recovery" ? "/account" : customerEmailReturnPath(returnTo);
  const fragment = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `${origin}${AUTH_CONFIRMATION_PATH}#${fragment.toString()}`;
}

const NEXT_PATHS = new Set([
  "/account",
  customerEmailReturnPath("/checkout"),
  customerEmailReturnPath("/checkout?group=1"),
  customerEmailReturnPath("/group-pay"),
  customerEmailReturnPath("/group-order"),
  customerEmailReturnPath("/whatsapp/checkout"),
]);

/** Parse only; no network. A link scanner opening the page cannot use the token. */
export function readCustomerTokenConfirmation(
  fragment: string,
): { tokenHash: string; type: CustomerVerifyType; next: string } | null {
  if (!fragment.startsWith("#") || fragment.length > 2000) return null;
  const values = new URLSearchParams(fragment.slice(1));
  const keys = [...values.keys()];
  if (keys.length !== 3 || !["token_hash", "type", "next"].every((key) => values.has(key)))
    return null;
  const tokenHash = values.get("token_hash") ?? "";
  const type = values.get("type") ?? "";
  const next = values.get("next") ?? "";
  if (!isAuthTokenHash(tokenHash) || tokenHash.startsWith("pkce_")) return null;
  if (type !== "signup" && type !== "magiclink" && type !== "recovery") return null;
  if (!NEXT_PATHS.has(next)) return null;
  return { tokenHash, type, next };
}
