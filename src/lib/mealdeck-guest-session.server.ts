import { createHash, randomBytes } from "node:crypto";

/** A browser-only bearer capability. It never goes in a URL or JSON response. */
export const GUEST_COOKIE_NAME = "__Host-mealdeck_guest";
const tokenPattern = /^[a-f0-9]{64}$/;
export const newGuestToken = () => randomBytes(32).toString("hex");
export const guestTokenHash = (token: string) => {
  if (!tokenPattern.test(token)) throw new Error("Invalid guest session");
  return createHash("sha256").update(token).digest("hex");
};

export function readGuestToken(cookie: string | null): string | null {
  if (!cookie || cookie.length > 16_384) return null;
  const entries = cookie
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(GUEST_COOKIE_NAME + "="));
  if (entries.length !== 1) return null;
  const token = entries[0]!.slice(GUEST_COOKIE_NAME.length + 1);
  return tokenPattern.test(token) ? token : null;
}

export function guestCookie(token: string): string {
  if (!tokenPattern.test(token)) throw new Error("Invalid guest session");
  return `${GUEST_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

export const expiredGuestCookie = () =>
  `${GUEST_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
