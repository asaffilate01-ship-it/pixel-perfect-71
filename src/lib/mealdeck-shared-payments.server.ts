import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import {
  readOnlineCheckoutStatus,
  readRequestOnlineCheckoutStatus,
} from "./mealdeck-online-checkout.server";
import {
  cancelOrderCollection,
  ensureCheckoutCollection,
  loadPaymentCollection,
  observeOrderPayment,
  parsePaymentCollection,
} from "./mealdeck-order-payments-stripe.server";
import {
  createPaymentClients,
  PAYMENT_NO_STORE,
  paymentErrorResponse,
  paymentIdentity,
  paymentIdentityParams,
  paymentObject,
  paymentRpc,
  paymentRpcList,
  paymentUnavailable,
  readPaymentInput,
  requirePaymentOrigin,
  type PaymentClients,
  type PaymentIdentity,
  type PaymentJson,
} from "./mealdeck-payment-server-core";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  parseSharedPaymentRoom,
  sharedPaymentRequestSchema,
  type SharedPaymentCapabilities,
  type SharedPaymentInviteLink,
  type SharedPaymentRoom,
} from "./mealdeck-shared-payments";
import { readMealDeckStripeConfig, verifyStripeAccount } from "./mealdeck-stripe.server";
import {
  MEALDECK_GROUP_ORDERING_STARTS_AT,
  MEALDECK_GROUP_ORDERING_STARTS_MESSAGE,
  newGroupRoomsAreOpen,
} from "./mealdeck-group-launch";

const GROUP_ORIGIN = "https://mealdeck.co.uk";
const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

export function readGroupLinkSecret(env: MealDeckRuntimeEnv) {
  const secret = env["MEALDECK_GROUP_LINK_SECRET"]?.trim();
  return secret && /^[A-Za-z0-9_-]{43,256}$/.test(secret) ? secret : null;
}

function keyed(secret: string, purpose: string, parts: string[]) {
  return createHmac("sha256", secret)
    .update(JSON.stringify(["mealdeck-group-v1", purpose, ...parts]))
    .digest();
}

/** Deterministic only within a private, domain-separated server key. */
export function groupPaymentUuid(secret: string, purpose: string, parts: string[]) {
  const bytes = keyed(secret, purpose, parts).subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

export function groupShareToken(secret: string, roomId: string, shareId: string) {
  return keyed(secret, "participant-access", [roomId, shareId]).toString("base64url");
}

function validShareToken(secret: string, roomId: string, shareId: string, token: string) {
  const expected = Buffer.from(groupShareToken(secret, roomId, shareId));
  const supplied = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function cookieName(roomId: string) {
  return "__Secure-mealdeck-group-" + roomId;
}

export function groupAccessCookie(roomId: string, shareId: string, token: string) {
  return (
    cookieName(roomId) +
    "=" +
    shareId +
    "." +
    token +
    "; Path=/api/group-payments; Max-Age=86400; HttpOnly; Secure; SameSite=Strict"
  );
}

function readShareAccess(request: Request, secret: string | null, roomId: string) {
  if (!secret) return null;
  const cookies = (request.headers.get("Cookie") ?? "").split(";").map((entry) => entry.trim());
  const matches = cookies.filter((entry) => entry.startsWith(cookieName(roomId) + "="));
  if (matches.length !== 1) return null;
  const [shareId, token, extra] = matches[0]!.slice(cookieName(roomId).length + 1).split(".");
  if (
    !shareId ||
    !/^[a-f0-9-]{36}$/.test(shareId) ||
    !token ||
    extra ||
    !validShareToken(secret, roomId, shareId, token)
  )
    return null;
  return { shareId, tokenHash: hashToken(token) };
}

export async function readSharedPaymentCapabilities(
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  request?: Request,
  serverNow: () => number = Date.now,
): Promise<SharedPaymentCapabilities> {
  const status = request
    ? await readRequestOnlineCheckoutStatus(request, env, fetcher)
    : await readOnlineCheckoutStatus(env, fetcher);
  const available =
    status.available &&
    env["MEALDECK_SHARED_PAYMENTS_ENABLED"] === "true" &&
    readGroupLinkSecret(env) !== null;
  return {
    available,
    newRoomsAvailable: available && newGroupRoomsAreOpen(serverNow()),
    groupOrderingStartsAt: MEALDECK_GROUP_ORDERING_STARTS_AT,
    guestEligible: available && status.guestCheckout.eligible,
    message: available
      ? "Choose one payment, pay by numbered bag, or split the total equally. The kitchen receives one order after the full total is paid."
      : "Shared payments are not accepting new orders at the moment. Existing payment rooms can still be checked.",
  };
}

const finitePence = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : NaN;

/** An explicit safe projection: never spread database payment/contact fields into HTTP. */
export function sharedRoomForBrowser(
  data: PaymentJson,
  options: { available: boolean; hasIdentity: boolean },
): SharedPaymentRoom {
  const viewer = paymentObject(data["viewer"]);
  const owner = viewer["role"] === "organiser";
  const total = finitePence(data["totalPence"]);
  const paid = finitePence(data["paidPence"] ?? data["capturedPence"]);
  const remaining = finitePence(data["remainingPence"]);
  const expired =
    data["fundingExpired"] === true || Date.parse(String(data["expiresAt"])) <= Date.now();
  let status: SharedPaymentRoom["status"] = "awaiting_payment";
  if (data["status"] === "paid") status = "paid";
  else if (data["status"] === "cancelled") status = "cancelled";
  else if (data["status"] === "refund_review" || data["holdReason"]) status = "refund_review";
  else if (expired) status = paid > 0 ? "refund_review" : "expired";
  else if (paid > 0) status = "partially_paid";
  const shares = Array.isArray(data["shares"])
    ? data["shares"].map((value) => {
        const share = paymentObject(value);
        let shareStatus =
          share["status"] === "paid"
            ? "paid"
            : share["status"] === "refund_review"
              ? "refund_review"
              : share["status"] === "pending"
                ? "processing"
                : "unpaid";
        if (shareStatus === "unpaid" && ["cancelled", "expired"].includes(status))
          shareStatus = "cancelled";
        return {
          shareId: share["shareId"],
          bagNumber: share["bagNumber"],
          amountPence: share["amountPence"],
          paidPence: share["paidPence"] ?? (shareStatus === "paid" ? share["amountPence"] : 0),
          status: shareStatus,
        };
      })
    : [];
  const packing = paymentObject(data["packingPlan"]);
  const lines = Array.isArray(data["lines"])
    ? data["lines"].map((value) => {
        const line = paymentObject(value);
        const modifiers = Array.isArray(line["modifiers"])
          ? line["modifiers"]
              .map((modifier) => {
                const choice = paymentObject(modifier);
                return typeof choice["name"] === "string" ? String(choice["name"]) : "";
              })
              .filter(Boolean)
              .join(" · ")
          : "";
        return {
          lineId: line["lineId"],
          name: line["name"],
          quantity: line["quantity"],
          linePence: line["line_pence"],
          ...(modifiers ? { description: modifiers } : {}),
        };
      })
    : [];
  const canPay =
    options.available &&
    options.hasIdentity &&
    ["awaiting_payment", "partially_paid"].includes(status) &&
    remaining > 0 &&
    Date.parse(String(data["expiresAt"])) >= Date.now() + 30 * 60_000 &&
    shares.some((share) => share.status === "unpaid");
  const messages: Record<SharedPaymentRoom["status"], string> = {
    awaiting_payment:
      "Your order is saved. Every contribution is linked to this order; the kitchen receives it when the full total is paid.",
    partially_paid:
      "Some contributions are paid. The kitchen receives this order after its remaining total is paid.",
    paid: "The full order is paid and sent to the kitchen. Staff acceptance and preparation are the next steps; do not pay again at collection.",
    cancelled:
      "This group order is cancelled. Pending payments are being checked before their shares can be released.",
    expired:
      "The funding deadline has passed. Any payment still processing will be checked before a new order is started.",
    refund_review:
      "This order needs staff payment review. Captured funds are recorded; a refund has not been automatically issued.",
    hold: "This order needs staff payment review before it can continue.",
  };
  const result = parseSharedPaymentRoom({
    schemaVersion: 1,
    roomId: data["roomId"],
    orderId: data["orderId"],
    ...(data["orderNumber"] === undefined ? {} : { orderNumber: data["orderNumber"] }),
    handoffCode: data["handoffCode"] ?? null,
    splitMode: data["splitMode"],
    status,
    currency: "gbp",
    totalPence: total,
    paidPence: paid,
    remainingPence: remaining,
    expiresAt: data["expiresAt"],
    viewer: { role: owner ? "organiser" : "participant", shareId: viewer["shareId"] ?? null },
    canPay,
    canCancel: owner && ["awaiting_payment", "partially_paid", "expired"].includes(status),
    message:
      messages[status] +
      (!options.available && ["awaiting_payment", "partially_paid"].includes(status)
        ? " New payments are currently paused; existing payment confirmations still update."
        : ""),
    shares,
    lines,
    bags: packing["bags"],
    cutleryRequested: packing["cutleryRequested"],
    fulfilment: data["fulfilment"],
  });
  if (!result)
    throw paymentUnavailable(
      "The saved group order could not be verified. Please refresh its status.",
    );
  return result;
}

function inviteLinks(
  secret: string | null,
  room: SharedPaymentRoom,
): SharedPaymentInviteLink[] | undefined {
  if (!secret || room.viewer.role !== "organiser") return undefined;
  return room.shares.map((share) => ({
    shareId: share.shareId,
    bagNumber: share.bagNumber,
    url:
      GROUP_ORIGIN +
      "/group-pay?room=" +
      room.roomId +
      "#share=" +
      share.shareId +
      "&key=" +
      groupShareToken(secret, room.roomId, share.shareId),
  }));
}

function roomScope(roomId: string, identity: PaymentIdentity, tokenHash: string | null) {
  return { p_room: roomId, ...paymentIdentityParams(identity), p_share_token_hash: tokenHash };
}

async function readRoom(
  clients: PaymentClients,
  roomId: string,
  identity: PaymentIdentity,
  tokenHash: string | null,
) {
  return paymentRpc(
    clients.service,
    "mealdeck_group_payment_status",
    roomScope(roomId, identity, tokenHash),
  );
}

export async function handleSharedPaymentsRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  serverNow: () => number = Date.now,
) {
  try {
    if (request.method === "GET")
      return Response.json(await readSharedPaymentCapabilities(env, fetcher, request, serverNow), {
        headers: PAYMENT_NO_STORE,
      });
    if (request.method !== "POST")
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: PAYMENT_NO_STORE },
      );
    requirePaymentOrigin(request);
    const parsed = sharedPaymentRequestSchema.safeParse(await readPaymentInput(request));
    if (!parsed.success)
      throw new CheckoutProblem("invalid_request", "Check the payment request and try again.");
    const input = parsed.data;
    const clients = createPaymentClients(env, fetcher);
    if (!clients) throw paymentUnavailable();
    const secret = readGroupLinkSecret(env);
    const stripe = readMealDeckStripeConfig(env);
    const identity = await paymentIdentity(
      request,
      clients,
      input.action === "create" || input.action === "pay" || input.action === "cancel",
    );
    const hasIdentity = Boolean(identity.customerId || identity.guestTokenHash);
    const capabilities = await readSharedPaymentCapabilities(env, fetcher, request, serverNow);
    const projectRoom = (raw: PaymentJson) =>
      sharedRoomForBrowser(raw, { available: capabilities.available, hasIdentity });
    const recoveryShareHash =
      input.action === "join"
        ? hashToken(input.token)
        : "roomId" in input
          ? (readShareAccess(request, secret, input.roomId)?.tokenHash ?? null)
          : null;
    const result = async (raw: PaymentJson, extra: PaymentJson = {}, cookie?: string) => {
      const room = projectRoom(raw);
      const links = inviteLinks(secret, room);
      let resumePayments: { attemptId: string; amountPence: number; coverRemaining: boolean }[] =
        [];
      if (hasIdentity && stripe && ["awaiting_payment", "partially_paid"].includes(room.status)) {
        const candidates = await paymentRpcList(
          clients.service,
          "mealdeck_group_payment_collections",
          roomScope(room.roomId, identity, recoveryShareHash),
        );
        resumePayments = candidates
          .filter((value) => paymentObject(value)["payerAccess"] === true)
          .map(parsePaymentCollection)
          .filter(
            (collection) =>
              collection.method === "checkout" &&
              !collection.cancelRequested &&
              ["reserved", "pending"].includes(collection.status) &&
              Date.parse(collection.expiresAt) > Date.now() &&
              collection.stripeAccount === stripe.accountId &&
              collection.livemode === stripe.livemode,
          )
          .map((collection) => ({
            attemptId: collection.attemptId,
            amountPence: collection.amountPence,
            coverRemaining: collection.coverRemaining,
          }));
      }
      return Response.json(
        { room, ...(links ? { inviteLinks: links } : {}), resumePayments, ...extra },
        {
          headers: { ...PAYMENT_NO_STORE, ...(cookie ? { "Set-Cookie": cookie } : {}) },
        },
      );
    };
    if (input.action === "create") {
      if (!secret || !stripe) throw paymentUnavailable();
      const owner = identity.customerId ?? identity.guestTokenHash!;
      const ids = [
        clients.config.tenantId,
        clients.config.locationId,
        owner,
        input.quoteId,
        input.attemptId,
      ];
      const roomId = groupPaymentUuid(secret, "room", ids);
      try {
        const prior = await readRoom(clients, roomId, identity, null);
        if (
          prior["splitMode"] !== input.splitMode ||
          !Array.isArray(prior["shares"]) ||
          prior["shares"].length !== input.bagCount
        )
          throw new CheckoutProblem(
            "attempt_conflict",
            "This saved order uses a different payment split. Open the existing room.",
            409,
          );
        return await result(prior);
      } catch (error) {
        if (!(error instanceof CheckoutProblem) || error.code !== "payment_not_found") throw error;
      }
      if (!newGroupRoomsAreOpen(serverNow()))
        throw new CheckoutProblem(
          "group_ordering_not_started",
          MEALDECK_GROUP_ORDERING_STARTS_MESSAGE,
          403,
        );
      if (!capabilities.available) throw paymentUnavailable(capabilities.message);
      await verifyStripeAccount(stripe, fetcher);
      const tokens = Array.from({ length: input.bagCount }, (_, index) => {
        const shareId = groupPaymentUuid(secret, "share", [roomId, String(index + 1)]);
        return {
          shareId,
          bagNumber: index + 1,
          tokenHash: hashToken(groupShareToken(secret, roomId, shareId)),
        };
      });
      const room = await paymentRpc(clients.service, "mealdeck_create_group_payment_room", {
        p_room: roomId,
        p_quote: input.quoteId,
        ...paymentIdentityParams(identity),
        p_attempt: input.attemptId,
        p_split_mode: input.splitMode,
        p_share_tokens: tokens,
        p_stripe_account: stripe.accountId,
        p_livemode: stripe.livemode,
      });
      return await result(room);
    }
    if (input.action === "join") {
      if (!secret || !validShareToken(secret, input.roomId, input.shareId, input.token))
        throw new CheckoutProblem(
          "payment_not_found",
          "This payment invitation is unavailable. Ask the organiser for its full link.",
          404,
        );
      const raw = await readRoom(clients, input.roomId, identity, hashToken(input.token));
      return await result(raw, {}, groupAccessCookie(input.roomId, input.shareId, input.token));
    }
    const access = readShareAccess(request, secret, input.roomId);
    let raw = await readRoom(clients, input.roomId, identity, access?.tokenHash ?? null);
    if (input.action === "room") return await result(raw);
    if (!stripe)
      throw paymentUnavailable(
        "Payment status is temporarily unavailable. Your saved order has not been replaced.",
      );
    if (input.action === "pay") {
      if (stripe.checkoutDomain?.status === "invalid") throw paymentUnavailable();
      const existing = (
        await paymentRpcList(
          clients.service,
          "mealdeck_group_payment_collections",
          roomScope(input.roomId, identity, access?.tokenHash ?? null),
        )
      )
        .map(parsePaymentCollection)
        .some(
          (collection) =>
            collection.attemptId === input.attemptId && collection.method === "checkout",
        );
      if (!existing && !capabilities.available) throw paymentUnavailable(capabilities.message);
      await verifyStripeAccount(stripe, fetcher, !existing);
      let tokenHash = access?.tokenHash ?? null;
      if (!input.coverRemaining && paymentObject(raw["viewer"])["role"] === "organiser") {
        const first = (Array.isArray(raw["shares"]) ? raw["shares"] : [])
          .map(paymentObject)
          .find((share) => share["bagNumber"] === 1);
        if (!secret || typeof first?.["shareId"] !== "string") throw paymentUnavailable();
        tokenHash = hashToken(groupShareToken(secret, input.roomId, first["shareId"]));
      }
      const collection = parsePaymentCollection(
        await paymentRpc(clients.service, "mealdeck_prepare_group_payment", {
          ...roomScope(input.roomId, identity, tokenHash),
          p_cover_remaining: input.coverRemaining,
          p_attempt: input.attemptId,
          p_stripe_account: stripe.accountId,
          p_livemode: stripe.livemode,
        }),
      );
      const prepared = await ensureCheckoutCollection(clients, stripe, collection, fetcher);
      if (!prepared.checkoutUrl)
        await observeOrderPayment(clients, stripe, prepared.collection, fetcher);
      raw = await readRoom(clients, input.roomId, identity, access?.tokenHash ?? null);
      return await result(raw, { checkoutUrl: prepared.checkoutUrl });
    }
    await verifyStripeAccount(stripe, fetcher, false);
    if (input.action === "cancel") {
      const cancellation = await paymentRpc(clients.service, "mealdeck_cancel_group_payment_room", {
        p_room: input.roomId,
        ...paymentIdentityParams(identity),
      });
      const collections = Array.isArray(cancellation["collectionsToCancel"])
        ? cancellation["collectionsToCancel"]
        : [];
      // Sequential mutations retain a clear provider/ledger order. A failed
      // provider read leaves the cancelled room and its claims safely locked.
      for (const value of collections) {
        const entry = paymentObject(value);
        if (typeof entry["collectionId"] !== "string") throw paymentUnavailable();
        const collection = await loadPaymentCollection(clients, stripe, entry["collectionId"]);
        await cancelOrderCollection(clients, stripe, collection, fetcher);
      }
    } else {
      const collections = await paymentRpcList(
        clients.service,
        "mealdeck_group_payment_collections",
        roomScope(input.roomId, identity, access?.tokenHash ?? null),
      );
      for (const value of collections) {
        const collection = parsePaymentCollection(value);
        if (collection.cancelRequested && collection.status !== "cancelled")
          await cancelOrderCollection(clients, stripe, collection, fetcher);
        else await observeOrderPayment(clients, stripe, collection, fetcher);
      }
    }
    return await result(await readRoom(clients, input.roomId, identity, access?.tokenHash ?? null));
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
