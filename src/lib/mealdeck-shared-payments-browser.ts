import { getMealDeckCustomerAccessToken } from "./mealdeck-customer-browser";
import {
  requestMealDeckAvailability,
  type MealDeckCheckoutMode,
} from "./mealdeck-checkout-browser";
import { safeMealDeckCheckoutRedirect } from "./mealdeck-checkout-url";
import {
  isSharedPaymentRoomId,
  parseSharedPaymentCapabilities,
  parseSharedPaymentResult,
  sharedPaymentRequestSchema,
  type SharedPaymentCapabilities,
  type SharedPaymentRequest,
  type SharedPaymentResult,
} from "./mealdeck-shared-payments";

export type SharedPaymentRequestMode = MealDeckCheckoutMode | "access";
export const LAST_SHARED_PAYMENT_ROOM_KEY = "mealdeck-last-payment-room-v1";
let rememberedRoom: string | null = null;

function requestMessage(value: unknown) {
  if (value && typeof value === "object" && "message" in value) {
    const message = value.message;
    if (typeof message === "string" && message.trim() && message.length <= 2000) return message;
  }
  return "We couldn't update the payment room. Please try again.";
}

async function readResponse(response: Response): Promise<unknown> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("The payment service could not be reached. Please try again.");
  }
  if (!response.ok) throw new Error(requestMessage(value));
  return value;
}

export async function readSharedPaymentCapabilities(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  getToken: () => Promise<string | null> = getMealDeckCustomerAccessToken,
): Promise<SharedPaymentCapabilities> {
  const value = await readResponse(
    await requestMealDeckAvailability("/api/group-payments", getToken, signal, request),
  );
  const parsed = parseSharedPaymentCapabilities(value);
  if (!parsed) throw new Error("Shared payment setup could not be verified. Please try again.");
  return parsed;
}

/** A guest payment never borrows a signed-in member's identity. */
export async function requestSharedPayment(
  mode: SharedPaymentRequestMode,
  input: SharedPaymentRequest,
  getAccessToken: () => Promise<string | null>,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<SharedPaymentResult> {
  const parsedInput = sharedPaymentRequestSchema.safeParse(input);
  if (!parsedInput.success) throw new Error("Please review the payment request and try again.");
  if (mode === "access" && ["create", "pay"].includes(parsedInput.data.action))
    throw new Error("Choose member or guest payment before continuing.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mode !== "guest") {
    const token =
      mode === "access" ? await getAccessToken().catch(() => null) : await getAccessToken();
    if (!token && mode === "member") throw new Error("Sign in and verify your email to pay.");
    if (token) headers["Authorization"] = "Bearer " + token;
  }
  const result = parseSharedPaymentResult(
    await readResponse(
      await request("/api/group-payments", {
        method: "POST",
        headers,
        body: JSON.stringify(parsedInput.data),
        credentials: "same-origin",
        cache: "no-store",
        ...(signal ? { signal } : {}),
      }),
    ),
  );
  if (!result)
    throw new Error("The payment room returned incomplete details. Refresh before paying.");
  if ("roomId" in parsedInput.data && result.room.roomId !== parsedInput.data.roomId)
    throw new Error("The payment room did not match your link. Reopen the original invitation.");
  return result;
}

export type SharedPaymentInvitation = { roomId: string; shareId: string; token: string };

/** Secrets live only in the incoming fragment and this request, never in browser storage. */
export function parseSharedPaymentInvitation(
  roomId: string,
  fragment: string,
): SharedPaymentInvitation | null {
  if (!fragment) return null;
  const invalid = () => new Error("This payment invitation is incomplete. Ask for the full link.");
  if (!isSharedPaymentRoomId(roomId) || !fragment.startsWith("#") || fragment.length > 2000)
    throw invalid();
  const parameters = new URLSearchParams(fragment.slice(1));
  if (
    [...parameters.keys()].length !== 2 ||
    parameters.getAll("share").length !== 1 ||
    parameters.getAll("key").length !== 1
  )
    throw invalid();
  const parsed = sharedPaymentRequestSchema.safeParse({
    action: "join",
    roomId,
    shareId: parameters.get("share"),
    token: parameters.get("key"),
  });
  if (!parsed.success || parsed.data.action !== "join") throw invalid();
  return { roomId, shareId: parsed.data.shareId, token: parsed.data.token };
}

export function safeSharedPaymentInviteUrl(
  value: string,
  roomId: string,
  shareId: string,
  origin: string,
): string | null {
  try {
    const url = new URL(value);
    if (
      ![origin, "https://mealdeck.co.uk", "https://www.mealdeck.co.uk"].includes(url.origin) ||
      !["https:", "http:"].includes(url.protocol) ||
      url.pathname !== "/group-pay" ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].length !== 1 ||
      url.searchParams.get("room") !== roomId
    )
      return null;
    const invitation = parseSharedPaymentInvitation(roomId, url.hash);
    return invitation?.shareId === shareId ? url.href : null;
  } catch {
    return null;
  }
}

export function safeSharedPaymentCheckoutUrl(value: unknown): string | null {
  return safeMealDeckCheckoutRedirect(value);
}

/** The only saved room information is its UUID, which grants no access by itself. */
export function rememberSharedPaymentRoom(roomId: string): boolean {
  if (!isSharedPaymentRoomId(roomId)) return false;
  rememberedRoom = roomId;
  let saved = false;
  try {
    sessionStorage.setItem(LAST_SHARED_PAYMENT_ROOM_KEY, roomId);
    saved = true;
  } catch {
    /* Same-visit recovery still works. */
  }
  try {
    localStorage.setItem(LAST_SHARED_PAYMENT_ROOM_KEY, roomId);
    saved = true;
  } catch {
    /* Same-tab recovery may still work. */
  }
  return saved;
}

export function readRememberedSharedPaymentRoom(): string | null {
  try {
    const value = sessionStorage.getItem(LAST_SHARED_PAYMENT_ROOM_KEY);
    if (isSharedPaymentRoomId(value)) return value;
  } catch {
    /* Try the non-sensitive durable pointer. */
  }
  try {
    const value = localStorage.getItem(LAST_SHARED_PAYMENT_ROOM_KEY);
    if (isSharedPaymentRoomId(value)) return value;
  } catch {
    /* Memory is sufficient for this visit. */
  }
  return rememberedRoom;
}

export function resolveSharedPaymentRoom(search: string): string | null {
  const parameters = new URLSearchParams(search);
  if (!parameters.has("room")) return readRememberedSharedPaymentRoom();
  const roomId = parameters.get("room");
  if (parameters.getAll("room").length !== 1 || !isSharedPaymentRoomId(roomId))
    throw new Error("This payment room link is invalid. Reopen the original link.");
  return roomId;
}
