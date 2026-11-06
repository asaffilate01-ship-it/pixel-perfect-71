import { getMealDeckCustomerAccessToken } from "./mealdeck-customer-browser";
import {
  requestMealDeckAvailability,
  type MealDeckCheckoutMode,
} from "./mealdeck-checkout-browser";
import { safeMealDeckCheckoutRedirect } from "./mealdeck-checkout-url";
import {
  groupOrderCapabilitiesSchema,
  groupOrderInvitationPreviewSchema,
  groupOrderInviteSchema,
  groupOrderRequestSchema,
  groupOrderResultSchema,
  groupOrderRoomPath,
  type GroupOrderCapabilities,
  type GroupOrderInvite,
  type GroupOrderInvitationPreview,
  type GroupOrderRequest,
  type GroupOrderResult,
} from "./mealdeck-group-rooms";

const POINTER = "mealdeck-current-ordering-room-v1";
let rememberedRoom: string | null = null;
const isRoom = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function readResponse(response: Response): Promise<unknown> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("The group room could not be reached. Please retry.");
  }
  if (!response.ok) {
    const message = value && typeof value === "object" && "message" in value ? value.message : null;
    throw new Error(
      typeof message === "string" && message.length <= 2000
        ? message
        : "The group room could not be updated. Please refresh and retry.",
    );
  }
  return value;
}

export async function fetchGroupOrderCapabilities(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  getToken: () => Promise<string | null> = getMealDeckCustomerAccessToken,
): Promise<GroupOrderCapabilities> {
  const parsed = groupOrderCapabilitiesSchema.safeParse(
    await readResponse(
      await requestMealDeckAvailability("/api/group-orders", getToken, signal, request),
    ),
  );
  if (!parsed.success) throw new Error("Group ordering availability could not be checked.");
  return parsed.data;
}

/** A capability allows room editing, never a member/guest payment by itself. */
export async function requestGroupOrder(
  input: Exclude<GroupOrderRequest, { action: "preview" }>,
  mode?: MealDeckCheckoutMode,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  getToken: () => Promise<string | null> = getMealDeckCustomerAccessToken,
): Promise<GroupOrderResult> {
  const parsed = groupOrderRequestSchema.safeParse(input);
  if (!parsed.success) throw new Error("Review your room details and choices before continuing.");
  if (!mode && ["create", "finalize", "pay", "cancel"].includes(input.action))
    throw new Error("Choose member or guest details before continuing.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mode === "member") {
    const bearer = await getToken();
    if (!bearer) throw new Error("Sign in with your verified member account before continuing.");
    headers["Authorization"] = "Bearer " + bearer;
  }
  const result = groupOrderResultSchema.safeParse(
    await readResponse(
      await request("/api/group-orders", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: JSON.stringify(parsed.data),
        ...(signal ? { signal } : {}),
      }),
    ),
  );
  if (!result.success)
    throw new Error("The room returned incomplete details. Refresh before paying.");
  if ("roomId" in input && result.data.room.roomId !== input.roomId)
    throw new Error("The room does not match your invitation. Open the original link.");
  if (result.data.checkoutUrl && !safeMealDeckCheckoutRedirect(result.data.checkoutUrl))
    throw new Error("The payment link could not be verified. Refresh the original room.");
  for (const link of result.data.inviteLinks ?? [])
    if (!safeGroupOrderInviteUrl(link.url, result.data.room.roomId, link.participantId))
      throw new Error("An invitation could not be verified. Refresh the room.");
  return result.data;
}

export async function previewGroupOrderInvite(
  invite: GroupOrderInvite,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<GroupOrderInvitationPreview> {
  const clean = groupOrderInviteSchema.safeParse(invite);
  if (!clean.success) throw new Error("This invitation is incomplete. Ask for its full link.");
  const preview = groupOrderInvitationPreviewSchema.safeParse(
    await readResponse(
      await request("/api/group-orders", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", ...clean.data }),
        ...(signal ? { signal } : {}),
      }),
    ),
  );
  if (
    !preview.success ||
    preview.data.roomId !== invite.roomId ||
    preview.data.participantId !== invite.participantId
  )
    throw new Error("The invitation does not match this room. Ask for a fresh invitation.");
  return preview.data;
}

/** No invitation secret, draft choices, name or payment data is stored. */
export function rememberGroupOrderRoom(roomId: string): boolean {
  if (!isRoom(roomId)) return false;
  rememberedRoom = roomId;
  try {
    sessionStorage.setItem(POINTER, roomId);
    return true;
  } catch {
    return false;
  }
}
export function readRememberedGroupOrderRoom(): string | null {
  try {
    const room = sessionStorage.getItem(POINTER);
    if (isRoom(room)) return room;
  } catch {
    /* The same-visit pointer is sufficient. */
  }
  return rememberedRoom;
}
export function clearRememberedGroupOrderRoom(): void {
  rememberedRoom = null;
  try {
    sessionStorage.removeItem(POINTER);
  } catch {
    /* The in-memory pointer is already cleared. */
  }
}
export function resolveGroupOrderRoom(search: string): string | null {
  const parameters = new URLSearchParams(search);
  if (!parameters.has("room")) return readRememberedGroupOrderRoom();
  const room = parameters.get("room");
  if (parameters.getAll("room").length !== 1 || !isRoom(room))
    throw new Error("This room link is invalid. Open the full invitation.");
  return room;
}
export function parseGroupOrderInvite(roomId: string, fragment: string): GroupOrderInvite | null {
  if (!fragment) return null;
  const invalid = () =>
    new Error("This invitation is incomplete. Ask the organiser for the room link.");
  if (!isRoom(roomId) || !fragment.startsWith("#") || fragment.length > 1000) throw invalid();
  const params = new URLSearchParams(fragment.slice(1));
  if (
    [...params.keys()].length !== 2 ||
    params.getAll("invite").length !== 1 ||
    params.getAll("key").length !== 1
  )
    throw invalid();
  const parsed = groupOrderInviteSchema.safeParse({
    roomId,
    participantId: params.get("invite"),
    token: params.get("key"),
  });
  if (!parsed.success) throw invalid();
  return parsed.data;
}
export function safeGroupOrderInviteUrl(
  value: string,
  roomId: string,
  participantId: string,
): string | null {
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://mealdeck.co.uk" ||
      url.pathname !== "/group-order" ||
      url.username ||
      url.password ||
      url.port ||
      [...url.searchParams.keys()].length !== 1 ||
      url.searchParams.get("room") !== roomId ||
      url.href !== value
    )
      return null;
    return parseGroupOrderInvite(roomId, url.hash)?.participantId === participantId ? value : null;
  } catch {
    return null;
  }
}
export { groupOrderRoomPath };
