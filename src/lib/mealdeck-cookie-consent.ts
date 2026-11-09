/** Strictly necessary storage remains available for basket, auth and security. */
export const MEALDECK_COOKIE_CONSENT_KEY = "mealdeck-cookie-consent-v1";
export const MEALDECK_COOKIE_CONSENT_EVENT = "mealdeck-cookie-consent-updated";
export type MealDeckCookieConsent = Readonly<{
  version: 1;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
}>;

export function parseMealDeckCookieConsent(raw: string | null): MealDeckCookieConsent | null {
  if (!raw || raw.length > 1000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const v = parsed as Record<string, unknown>;
    if (v.version !== 1 || typeof v.analytics !== "boolean" ||
      typeof v.marketing !== "boolean" || typeof v.savedAt !== "string" ||
      !Number.isFinite(Date.parse(v.savedAt))) return null;
    return { version: 1, analytics: v.analytics, marketing: v.marketing, savedAt: v.savedAt };
  } catch { return null; }
}

export function makeMealDeckCookieConsent(
  analytics: boolean,
  marketing: boolean,
  at = new Date(),
): MealDeckCookieConsent {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new Error("Invalid consent clock");
  return { version: 1, analytics: analytics === true, marketing: marketing === true,
    savedAt: at.toISOString() };
}

/** Consent must be present before any optional browser analytics/advertising code runs. */
export function allowsMealDeckOptionalCookies(
  consent: MealDeckCookieConsent | null,
  category: "analytics" | "marketing",
): boolean {
  return consent?.[category] === true;
}
