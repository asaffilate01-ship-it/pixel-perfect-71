import { normaliseUkPostcode } from "./mealdeck-own-driver-delivery";
export type GuidedOrderMethod = "pickup" | "curbside" | "delivery";
export const GUIDED_ORDER_METHOD_KEY = "mealdeck-checkout-fulfilment-v1";
const MAX_AGE = 20 * 60_000;
type Choice = { method: GuidedOrderMethod; at: number };
let memory: Choice | null = null;
let area: { postcode: string; at: number } | null = null;
export function isGuidedOrderMethod(value: unknown): value is GuidedOrderMethod {
  return value === "pickup" || value === "curbside" || value === "delivery";
}
export function parseGuidedOrderChoice(raw: string | null, now: number): Choice | null {
  try {
    if (!raw || !Number.isFinite(now)) return null;
    const value = JSON.parse(raw) as Partial<Choice> | null;
    return value && isGuidedOrderMethod(value.method) && typeof value.at === "number" &&
      Number.isFinite(value.at) && value.at <= now && now - value.at < MAX_AGE
      ? { method: value.method, at: value.at } : null;
  } catch { return null; }
}
export function readGuidedOrderMethod(): GuidedOrderMethod | null {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(GUIDED_ORDER_METHOD_KEY);
    if (raw !== null) return parseGuidedOrderChoice(raw, now)?.method ?? null;
  } catch { /* Same-tab memory fallback. */ }
  return memory && now >= memory.at && now - memory.at < MAX_AGE ? memory.method : null;
}
export function rememberGuidedOrderMethod(method: GuidedOrderMethod, verifiedPostcode?: string) {
  if (typeof window === "undefined" || !isGuidedOrderMethod(method)) return;
  memory = { method, at: Date.now() };
  // Postcodes are ephemeral; they are never written to storage or a URL.
  if (method !== "delivery") area = null;
  else if (verifiedPostcode !== undefined) {
    const postcode = normaliseUkPostcode(verifiedPostcode);
    area = postcode ? { postcode, at: memory.at } : null;
  }
  try { sessionStorage.setItem(GUIDED_ORDER_METHOD_KEY, JSON.stringify(memory)); } catch { /* Memory only. */ }
}
export function readGuidedDeliveryPostcode(): string {
  if (typeof window === "undefined" || readGuidedOrderMethod() !== "delivery") return "";
  return area && Date.now() >= area.at && Date.now() - area.at < MAX_AGE ? area.postcode : "";
}
export function clearGuidedOrderMethod() {
  if (typeof window === "undefined") return;
  memory = null;
  area = null;
  try { sessionStorage.removeItem(GUIDED_ORDER_METHOD_KEY); } catch { /* Memory cleared. */ }
}
/** Presentation gate only; the server rechecks eligibility, price and payment. */
export function guidedMenuReady(method: GuidedOrderMethod | null, deliveryLive: boolean, postcode: string, verifiedPostcode: string | null): boolean {
  if (method === "pickup" || method === "curbside") return true;
  const canonical = normaliseUkPostcode(postcode);
  return method === "delivery" && deliveryLive && !!canonical && canonical === verifiedPostcode;
}
export function guidedCheckoutDetailsReady(method: GuidedOrderMethod | null, contactVerified: boolean, addressVerified: boolean, carValid: boolean): boolean {
  return contactVerified && (method === "pickup" || (method === "delivery" && addressVerified) || (method === "curbside" && carValid));
}
