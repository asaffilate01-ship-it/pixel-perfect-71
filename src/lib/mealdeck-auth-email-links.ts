import { customerEmailReturnPath } from "./mealdeck-customer-return";

export const AUTH_EMAIL_SITE_ORIGIN = "https://mealdeck.co.uk";
export const AUTH_CONFIRMATION_PATH = "/auth/confirm";
export const AUTH_VERIFY_TYPES = [
  "signup",
  "magiclink",
  "email",
  "recovery",
  "invite",
  "email_change",
] as const;
export type AuthVerifyType = (typeof AUTH_VERIFY_TYPES)[number];
const destinations = new Set([
  "/account",
  customerEmailReturnPath("/checkout"),
  customerEmailReturnPath("/checkout?group=1"),
  customerEmailReturnPath("/group-pay"),
  "/ops",
  "/kds",
  "/printer",
]);
export const isAuthTokenHash = (value: string) => /^(?:pkce_)?[a-f0-9]{56,128}$/.test(value);

/** Fixed production destinations for checkout, shared payments and staff sign-in. */
export function safeAuthEmailRedirect(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.origin !== AUTH_EMAIL_SITE_ORIGIN ||
      url.username ||
      url.password ||
      url.hash ||
      url.port
    )
      return null;
    // Auth's configured Site URL is the default for native OTP requests.
    if (url.pathname === "/" && !url.search) return AUTH_EMAIL_SITE_ORIGIN + "/account";
    const path = url.pathname + url.search;
    return destinations.has(path) ? AUTH_EMAIL_SITE_ORIGIN + path : null;
  } catch {
    return null;
  }
}

export function safeAuthProviderUrl(value: string, configuredAuthOrigin: string): string | null {
  if (value.length > 6000) return null;
  try {
    const origin = new URL(configuredAuthOrigin);
    const url = new URL(value);
    if (
      origin.protocol !== "https:" ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.username ||
      origin.password ||
      origin.port ||
      url.origin !== origin.origin ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      url.pathname !== "/auth/v1/verify"
    )
      return null;
    const fields = [...url.searchParams.keys()];
    if (
      fields.length !== 3 ||
      new Set(fields).size !== 3 ||
      fields.some((key) => !["token", "type", "redirect_to"].includes(key))
    )
      return null;
    const token = url.searchParams.get("token") ?? "";
    const type = url.searchParams.get("type") ?? "";
    const redirect = safeAuthEmailRedirect(url.searchParams.get("redirect_to") ?? "");
    if (!isAuthTokenHash(token) || !AUTH_VERIFY_TYPES.includes(type as AuthVerifyType) || !redirect)
      return null;
    // Preserve the provider token/PKCE prefix, but canonicalise only the allowed return URL.
    url.searchParams.set("redirect_to", redirect);
    return url.href;
  } catch {
    return null;
  }
}

export function authEmailConfirmationUrl(providerUrl: string): string {
  return (
    AUTH_EMAIL_SITE_ORIGIN +
    AUTH_CONFIRMATION_PATH +
    "#confirmation_url=" +
    encodeURIComponent(providerUrl)
  );
}

/** Parsing has no network or navigation side effects. A scanner GET cannot consume a token. */
export function readAuthEmailConfirmation(
  fragment: string,
  configuredAuthOrigin: string,
): string | null {
  if (!fragment.startsWith("#") || fragment.length > 9000) return null;
  const values = new URLSearchParams(fragment.slice(1));
  if ([...values.keys()].length !== 1 || !values.has("confirmation_url")) return null;
  return safeAuthProviderUrl(values.get("confirmation_url") ?? "", configuredAuthOrigin);
}
