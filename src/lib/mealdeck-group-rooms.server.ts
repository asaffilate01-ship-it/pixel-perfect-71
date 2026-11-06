import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CheckoutProblem, normaliseCheckoutSelection } from "./mealdeck-checkout-selection";
import {
  GROUP_ORDER_JOIN_SECONDS,
  GROUP_ORDER_MAX_PEOPLE,
  groupOrderInvitationPreviewSchema,
  groupOrderRequestSchema,
  groupOrderResultSchema,
  groupOrderRoomSchema,
  type GroupOrderPick,
  type GroupOrderRoom,
} from "./mealdeck-group-rooms";
import { normalisePackingPersonName } from "./mealdeck-packing-name";
import { parseKerbsideVehicle } from "./mealdeck-opening-offer";
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
  paymentDatabaseError,
  paymentErrorResponse,
  paymentIdentity,
  paymentIdentityParams,
  paymentObject,
  paymentRpc,
  paymentUnavailable,
  readPaymentInput,
  requirePaymentOrigin,
  type PaymentClients,
  type PaymentIdentity,
  type PaymentJson,
} from "./mealdeck-payment-server-core";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  groupPaymentUuid,
  groupShareToken,
  readGroupLinkSecret,
  readSharedPaymentCapabilities,
  sharedRoomForBrowser,
} from "./mealdeck-shared-payments.server";
import { readMealDeckStripeConfig, verifyStripeAccount } from "./mealdeck-stripe.server";

const ACTOR_COOKIE = "__Host-mealdeck-room-actor";
const GROUP_ORIGIN = "https://mealdeck.co.uk";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const NO_IDENTITY: PaymentIdentity = { customerId: null, guestTokenHash: null };

/** Room membership is a server-minted capability, separate from a payment identity. */
export function readOrderingActor(request: Request): string | null {
  const cookies = (request.headers.get("Cookie") ?? "").split(";").map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith(ACTOR_COOKIE + "="));
  if (matches.length !== 1) return null;
  const value = matches[0]!.slice(ACTOR_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function orderingActorCookie(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("Invalid room capability");
  return ACTOR_COOKIE + "=" + value + "; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax";
}

export function orderingInviteToken(secret: string, roomId: string, participantId: string) {
  return createHmac("sha256", secret)
    .update(JSON.stringify(["mealdeck-ordering-v1", "invitation", roomId, participantId]))
    .digest("base64url");
}

function verifyInvitation(
  secret: string | null,
  roomId: string,
  participantId: string,
  token: string,
) {
  if (!secret) return false;
  const expected = Buffer.from(orderingInviteToken(secret, roomId, participantId));
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function orderingDatabaseError(error: unknown) {
  const message = String(paymentObject(error)["message"] ?? "");
  const matches: [RegExp, string, string, number][] = [
    [
      /ordering_(invitation_unavailable|invitation_invalid)/,
      "invitation_unavailable",
      "This invitation is no longer available. Ask the organiser to check the room.",
      404,
    ],
    [
      /ordering_room_unavailable/,
      "room_unavailable",
      "Open this room in the browser where you joined it.",
      404,
    ],
    [
      /ordering_already_joined/,
      "already_joined",
      "You have already joined this room. Return to your own place.",
      409,
    ],
    [
      /ordering_owner_identity_required/,
      "owner_identity_required",
      "Use the same member or guest account that created this room.",
      403,
    ],
    [
      /ordering_organiser_required/,
      "organiser_required",
      "Only the organiser can change this part of the room.",
      403,
    ],
    [
      /ordering_(version_conflict|revision_conflict)/,
      "room_changed",
      "The room changed in another tab. Refresh and review the latest choices before continuing.",
      409,
    ],
    [
      /ordering_not_ready/,
      "room_not_ready",
      "Wait for everyone to finish choosing and for invitations to close.",
      409,
    ],
    [
      /ordering_choices_required/,
      "choices_required",
      "Add your food before marking your order ready, or leave the room.",
      400,
    ],
    [
      /ordering_basket_limit/,
      "basket_limit",
      "Keep the combined group order to 60 items or fewer.",
      400,
    ],
    [
      /ordering_name_invalid/,
      "name_invalid",
      "Use a name or nickname of up to 32 characters.",
      400,
    ],
    [
      /ordering_room_full/,
      "room_full",
      "A room can have up to 10 people, including the organiser.",
      400,
    ],
    [
      /ordering_frozen/,
      "room_frozen",
      "This order is already locked. Check its payment status before starting another.",
      409,
    ],
    [
      /ordering_payment_unavailable/,
      "payment_unavailable",
      "Your payment is not available for this room. Refresh its status.",
      409,
    ],
    [
      /ordering_(freeze_invalid|freeze_required|packing_mismatch|choices_mismatch|choices_invalid|room_invalid)/,
      "room_invalid",
      "Review the saved choices and collection details before continuing.",
      409,
    ],
  ];
  for (const [pattern, code, text, status] of matches)
    if (pattern.test(message)) return new CheckoutProblem(code, text, status);
  return paymentDatabaseError(error);
}

async function orderingRpc(
  clients: PaymentClients,
  name: string,
  params: PaymentJson,
): Promise<PaymentJson> {
  const { data, error } = await clients.service.rpc(name, params);
  if (error) throw orderingDatabaseError(error);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw paymentUnavailable();
  return data as PaymentJson;
}

async function orderingCollections(
  clients: PaymentClients,
  scope: PaymentJson,
): Promise<unknown[]> {
  const { data, error } = await clients.service.rpc("mealdeck_ordering_payment_collections", scope);
  if (error) throw orderingDatabaseError(error);
  if (!Array.isArray(data)) throw paymentUnavailable();
  return data;
}

/** Only roster labels, safe states and the authorised person's choices leave the server. */
export function orderingRoomForBrowser(data: PaymentJson): GroupOrderRoom {
  const viewer = paymentObject(data["viewer"]);
  const owner = viewer["role"] === "organiser";
  const people = Array.isArray(data["people"])
    ? data["people"].map((entry) => {
        const person = paymentObject(entry);
        const state = person["paymentState"];
        return {
          participantId: person["participantId"],
          name: person["name"],
          isOrganiser: person["isOrganiser"],
          state: person["state"],
          version: person["version"],
          bagNumber: person["bagNumber"],
          shareId: person["shareId"],
          paymentState:
            state === "unclaimed" ? "unpaid" : state === "pending" ? "processing" : (state ?? null),
          ...((owner || person["participantId"] === viewer["participantId"]) &&
          person["picks"] !== undefined
            ? { picks: person["picks"] }
            : {}),
        };
      })
    : [];
  const parsed = groupOrderRoomSchema.safeParse({
    schemaVersion: data["schemaVersion"],
    roomId: data["roomId"],
    revision: data["revision"],
    phase: data["phase"],
    paymentMode: data["paymentMode"],
    joinDeadline: data["joinDeadline"],
    invitationsClosed: data["invitationsClosed"],
    serverNow: data["serverNow"],
    createdAt: data["createdAt"],
    fulfilment: data["fulfilment"],
    ...(owner ? { vehicle: data["vehicle"] ?? null } : {}),
    cutleryRequested: data["cutleryRequested"],
    viewer: { participantId: viewer["participantId"], role: viewer["role"] },
    people,
    pendingCount: data["pendingCount"],
    joinedCount: data["joinedCount"],
    readyCount: data["readyCount"],
    canFinalize: owner && data["canFinalize"] === true,
    orderId: data["orderId"],
    paymentRoomId: data["paymentRoomId"],
  });
  if (!parsed.success)
    throw paymentUnavailable("The saved room could not be verified. Refresh before continuing.");
  return parsed.data;
}

/** Identical dishes stay on distinct lines when they belong to different people. */
export function finaliseOrderingSelection(room: GroupOrderRoom, tenantId: string) {
  if (room.viewer.role !== "organiser")
    throw new CheckoutProblem("organiser_required", "Only the organiser can lock the order.", 403);
  const included = room.people.filter((person) => person.state === "ready" && person.picks?.length);
  const picks: GroupOrderPick[] = [];
  const allocations: { lineId: string; bag: number; quantity: number }[] = [];
  for (const [index, person] of included.entries()) {
    for (const pick of person.picks!) {
      picks.push(pick);
      allocations.push({ lineId: "line-" + picks.length, bag: index + 1, quantity: pick.quantity });
    }
  }
  const canonical = normaliseCheckoutSelection(
    {
      action: "quote",
      fulfilment: room.fulfilment,
      vehicle: room.vehicle ?? null,
      picks,
      packing: {
        cutleryRequested: room.cutleryRequested,
        separateBags: true,
        bagCount: included.length,
        allocations,
      },
    },
    tenantId,
  );
  const packingPlan = {
    ...canonical.packingPlan,
    bags: canonical.packingPlan.bags.map((bag, index) => ({ ...bag, name: included[index]!.name })),
  };
  const payload = {
    fulfilment: canonical.fulfilment,
    vehicle: canonical.vehicle,
    lines: canonical.lines,
    packingPlan,
  };
  return { ...payload, requestHash: hash(JSON.stringify(payload)) };
}

function personName(value: string) {
  try {
    return normalisePackingPersonName(value);
  } catch {
    throw new CheckoutProblem("name_invalid", "Use a name or nickname of up to 32 characters.");
  }
}

export async function handleGroupOrdersRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method === "GET") {
      const available = await readSharedPaymentCapabilities(env, fetcher);
      const existing = readOrderingActor(request);
      const actor = existing ?? randomBytes(32).toString("base64url");
      return Response.json(
        {
          ...available,
          message: available.available
            ? "Create one room, invite your people and choose your own food. Pay separately or let the organiser pay."
            : "Group rooms are being prepared for this kitchen. Existing rooms can still be checked.",
          joinWindowSeconds: GROUP_ORDER_JOIN_SECONDS,
          maxPeople: GROUP_ORDER_MAX_PEOPLE,
        },
        {
          headers: {
            ...PAYMENT_NO_STORE,
            "Set-Cookie": orderingActorCookie(actor),
          },
        },
      );
    }
    if (request.method !== "POST")
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: PAYMENT_NO_STORE },
      );
    requirePaymentOrigin(request);
    const parsed = groupOrderRequestSchema.safeParse(await readPaymentInput(request));
    if (!parsed.success)
      throw new CheckoutProblem(
        "invalid_request",
        "Review your room details and choices before continuing.",
      );
    const input = parsed.data;
    const clients = createPaymentClients(env, fetcher);
    if (!clients) throw paymentUnavailable("Group rooms are being prepared for this kitchen.");
    const secret = readGroupLinkSecret(env);

    if (input.action === "preview") {
      if (!verifyInvitation(secret, input.roomId, input.participantId, input.token))
        throw orderingDatabaseError({ message: "ordering_invitation_unavailable" });
      const raw = await orderingRpc(clients, "mealdeck_ordering_invitation", {
        p_room: input.roomId,
        p_invite_hash: hash(input.token),
      });
      const preview = groupOrderInvitationPreviewSchema.safeParse({
        schemaVersion: raw["schemaVersion"],
        roomId: raw["roomId"],
        participantId: input.participantId,
        organiserName: raw["organiserName"],
        inviteeName: raw["invitedName"],
        paymentMode: raw["paymentMode"],
        joinDeadline: raw["joinDeadline"],
        serverNow: raw["serverNow"],
        joinable: raw["joinable"],
        message:
          raw["joinable"] === true
            ? "Accept your invitation to choose your own food in this room."
            : "This invitation has closed or has already been accepted. Return to the browser where you joined.",
      });
      if (!preview.success || preview.data.roomId !== input.roomId) throw paymentUnavailable();
      return Response.json(preview.data, { headers: PAYMENT_NO_STORE });
    }

    const actor = readOrderingActor(request);
    if (!actor)
      throw new CheckoutProblem(
        "room_session_required",
        "Refresh this page to start your private room session.",
        401,
      );
    const actorHash = hash(actor);
    const requiredIdentity = ["create", "finalize", "pay", "cancel"].includes(input.action);
    let identity: PaymentIdentity = NO_IDENTITY;
    try {
      identity = await paymentIdentity(request, clients, requiredIdentity);
    } catch (error) {
      // Expired optional guest details must not erase an accepted room. A member
      // Authorization header is always verified and never falls back to guest.
      if (
        requiredIdentity ||
        request.headers.has("Authorization") ||
        !(error instanceof CheckoutProblem) ||
        !["guest_session_expired", "ordering_closed"].includes(error.code)
      )
        throw error;
    }
    const hasIdentity = Boolean(identity.customerId || identity.guestTokenHash);
    const stripe = readMealDeckStripeConfig(env);
    const capabilities = await readSharedPaymentCapabilities(env, fetcher);
    const scope = (roomId: string) => ({ p_room: roomId, p_actor_hash: actorHash });
    const financialScope = (roomId: string) => ({
      ...scope(roomId),
      ...paymentIdentityParams(identity),
    });
    const readRoom = (roomId: string) =>
      orderingRpc(clients, "mealdeck_ordering_room_status", scope(roomId));

    const result = async (raw: PaymentJson, extra: { checkoutUrl?: string | null } = {}) => {
      const room = orderingRoomForBrowser(raw);
      const payment = room.paymentRoomId
        ? sharedRoomForBrowser(
            await orderingRpc(clients, "mealdeck_ordering_payment_status", scope(room.roomId)),
            { available: capabilities.available, hasIdentity },
          )
        : null;
      // A private room is still visible before payer sign-in. Its money actions
      // are enabled only for the selected payment mode and the actual owner.
      if (payment) {
        if (room.paymentMode === "organiser" && room.viewer.role !== "organiser")
          payment.canPay = false;
        payment.canCancel = payment.canCancel && hasIdentity;
      }
      const inviteLinks =
        room.viewer.role === "organiser" && secret && room.phase !== "cancelled"
          ? room.people
              .filter((person) => person.state === "invited")
              .map((person) => ({
                participantId: person.participantId,
                name: person.name,
                url:
                  GROUP_ORIGIN +
                  "/group-order?room=" +
                  room.roomId +
                  "#invite=" +
                  person.participantId +
                  "&key=" +
                  orderingInviteToken(secret, room.roomId, person.participantId),
              }))
          : undefined;
      let resumePayments: { attemptId: string; amountPence: number; coverRemaining: boolean }[] =
        [];
      if (
        payment &&
        hasIdentity &&
        stripe &&
        ["awaiting_payment", "partially_paid"].includes(payment.status)
      ) {
        let candidates: unknown[] = [];
        try {
          candidates = await orderingCollections(clients, financialScope(room.roomId));
        } catch (error) {
          // A room remains readable while its accepted person finishes payer
          // registration. Invalid bearer tokens were already rejected above.
          if (
            requiredIdentity ||
            !(error instanceof CheckoutProblem) ||
            !["registration_required", "guest_session_expired", "ordering_closed"].includes(
              error.code,
            )
          )
            throw error;
          payment.canPay = false;
          payment.canCancel = false;
        }
        resumePayments = candidates
          .filter((entry) => paymentObject(entry)["payerAccess"] === true)
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
      const body = groupOrderResultSchema.safeParse({
        room,
        payment,
        ...(inviteLinks ? { inviteLinks } : {}),
        resumePayments,
        ...extra,
      });
      if (!body.success)
        throw paymentUnavailable("The saved room could not be verified. Refresh before paying.");
      return Response.json(body.data, {
        headers: { ...PAYMENT_NO_STORE, "Set-Cookie": orderingActorCookie(actor) },
      });
    };

    if (input.action === "create") {
      if (!secret) throw paymentUnavailable();
      const roomId = groupPaymentUuid(secret, "ordering-room", [
        clients.config.tenantId,
        clients.config.locationId,
        actorHash,
        input.attemptId,
      ]);
      const name = personName(input.name);
      const vehicle = input.fulfilment === "curbside" ? parseKerbsideVehicle(input.vehicle) : null;
      if (
        (input.fulfilment === "curbside" && !vehicle) ||
        (input.fulfilment === "pickup" && input.vehicle != null)
      )
        throw new CheckoutProblem(
          "invalid_vehicle",
          "For kerbside pickup, enter the make, colour and last four registration characters.",
        );
      const invites = input.inviteNames.map((value, index) => {
        const participantId = groupPaymentUuid(secret, "ordering-participant", [
          roomId,
          String(index + 1),
        ]);
        return {
          participantId,
          name: personName(value),
          tokenHash: hash(orderingInviteToken(secret, roomId, participantId)),
        };
      });
      if (!capabilities.available) {
        // A lost create response must not hide an existing room during a pause.
        try {
          return await result(await readRoom(roomId));
        } catch (error) {
          if (!(error instanceof CheckoutProblem) || error.code !== "room_unavailable") throw error;
        }
        throw paymentUnavailable(capabilities.message);
      }
      return await result(
        await orderingRpc(clients, "mealdeck_create_ordering_room", {
          p_room: roomId,
          p_attempt: input.attemptId,
          p_tenant: clients.config.tenantId,
          p_location: clients.config.locationId,
          p_actor_hash: actorHash,
          ...paymentIdentityParams(identity),
          p_name: name,
          p_payment_mode: input.paymentMode,
          p_fulfilment: input.fulfilment,
          p_vehicle: vehicle,
          p_cutlery: input.cutleryRequested,
          p_invites: invites,
        }),
      );
    }
    if (input.action === "join") {
      if (!verifyInvitation(secret, input.roomId, input.participantId, input.token))
        throw orderingDatabaseError({ message: "ordering_invitation_unavailable" });
      return await result(
        await orderingRpc(clients, "mealdeck_accept_ordering_invitation", {
          ...scope(input.roomId),
          p_invite_hash: hash(input.token),
          p_name: personName(input.name),
        }),
      );
    }
    if (input.action === "save") {
      if (input.picks.length)
        normaliseCheckoutSelection(
          {
            action: "quote",
            fulfilment: "pickup",
            picks: input.picks,
            packing: { cutleryRequested: false, separateBags: false, bagCount: 1, allocations: [] },
          },
          clients.config.tenantId,
        );
      return await result(
        await orderingRpc(clients, "mealdeck_update_ordering_choices", {
          ...scope(input.roomId),
          p_expected_version: input.version,
          p_picks: input.picks,
        }),
      );
    }
    if (input.action === "ready")
      return await result(
        await orderingRpc(clients, "mealdeck_set_ordering_ready", {
          ...scope(input.roomId),
          p_expected_version: input.version,
          p_ready: input.ready,
        }),
      );
    if (input.action === "leave")
      return await result(
        await orderingRpc(clients, "mealdeck_leave_ordering_room", scope(input.roomId)),
      );
    if (input.action === "remove")
      return await result(
        await orderingRpc(clients, "mealdeck_remove_ordering_invitation", {
          ...scope(input.roomId),
          p_participant: input.participantId,
        }),
      );
    if (input.action === "close")
      return await result(
        await orderingRpc(clients, "mealdeck_close_ordering_invitations", scope(input.roomId)),
      );

    const raw = await readRoom(input.roomId);
    if (input.action === "room") return await result(raw);
    const room = orderingRoomForBrowser(raw);
    if (input.action === "finalize") {
      if (room.viewer.role !== "organiser")
        throw orderingDatabaseError({ message: "ordering_organiser_required" });
      if (room.orderId) {
        await orderingRpc(clients, "mealdeck_ordering_payment_access", {
          ...financialScope(room.roomId),
          p_cover_remaining: true,
        });
        return await result(raw);
      }
      if (!capabilities.available || !stripe || !secret)
        throw paymentUnavailable(capabilities.message);
      if (room.revision !== input.revision)
        throw orderingDatabaseError({ message: "ordering_revision_conflict" });
      if (!room.canFinalize) throw orderingDatabaseError({ message: "ordering_not_ready" });
      const canonical = finaliseOrderingSelection(room, clients.config.tenantId);
      await verifyStripeAccount(stripe, fetcher);
      const tokens = canonical.packingPlan.bags.map((bag) => {
        const shareId = groupPaymentUuid(secret, "ordering-share", [
          room.roomId,
          String(bag.number),
        ]);
        return {
          shareId,
          bagNumber: bag.number,
          tokenHash: hash(groupShareToken(secret, room.roomId, shareId)),
        };
      });
      return await result(
        await orderingRpc(clients, "mealdeck_finalize_ordering_room", {
          ...financialScope(room.roomId),
          p_expected_revision: input.revision,
          p_selection: canonical.lines,
          p_packing: canonical.packingPlan,
          p_request_hash: canonical.requestHash,
          p_attempt: input.attemptId,
          p_share_tokens: tokens,
          p_stripe_account: stripe.accountId,
          p_livemode: stripe.livemode,
        }),
      );
    }
    if (input.action === "cancel" && !room.orderId) {
      const cancellation = await orderingRpc(
        clients,
        "mealdeck_cancel_ordering_room",
        financialScope(room.roomId),
      );
      return await result(paymentObject(cancellation["room"]));
    }
    if (input.action === "reconcile" && !room.orderId) return await result(raw);
    if (!stripe)
      throw paymentUnavailable(
        "Payment status is temporarily unavailable. Your saved order has not been replaced.",
      );
    if (input.action === "pay") {
      const access = await orderingRpc(clients, "mealdeck_ordering_payment_access", {
        ...financialScope(room.roomId),
        p_cover_remaining: input.coverRemaining,
      });
      if (
        access["roomId"] !== room.roomId ||
        access["participantId"] !== room.viewer.participantId ||
        !(
          access["shareTokenHash"] === null ||
          /^[a-f0-9]{64}$/.test(String(access["shareTokenHash"]))
        )
      )
        throw paymentUnavailable();
      const candidates = await orderingCollections(clients, financialScope(room.roomId));
      const existing = candidates
        .filter((entry) => paymentObject(entry)["payerAccess"] === true)
        .map(parsePaymentCollection)
        .some(
          (collection) =>
            collection.attemptId === input.attemptId && collection.method === "checkout",
        );
      if (!existing && !capabilities.available) throw paymentUnavailable(capabilities.message);
      await verifyStripeAccount(stripe, fetcher, !existing);
      const collection = parsePaymentCollection(
        await paymentRpc(clients.service, "mealdeck_prepare_group_payment", {
          p_room: room.roomId,
          ...paymentIdentityParams(identity),
          p_share_token_hash: access["shareTokenHash"],
          p_cover_remaining: input.coverRemaining,
          p_attempt: input.attemptId,
          p_stripe_account: stripe.accountId,
          p_livemode: stripe.livemode,
        }),
      );
      const prepared = await ensureCheckoutCollection(clients, stripe, collection, fetcher);
      if (!prepared.checkoutUrl)
        await observeOrderPayment(clients, stripe, prepared.collection, fetcher);
      return await result(await readRoom(room.roomId), { checkoutUrl: prepared.checkoutUrl });
    }
    await verifyStripeAccount(stripe, fetcher, false);
    if (input.action === "cancel") {
      const cancellation = await orderingRpc(
        clients,
        "mealdeck_cancel_ordering_room",
        financialScope(room.roomId),
      );
      const collections = cancellation["collectionsToCancel"];
      if (!Array.isArray(collections)) throw paymentUnavailable();
      for (const value of collections) {
        const entry = paymentObject(value);
        if (typeof entry["collectionId"] !== "string") throw paymentUnavailable();
        await cancelOrderCollection(
          clients,
          stripe,
          await loadPaymentCollection(clients, stripe, entry["collectionId"]),
          fetcher,
        );
      }
    } else {
      for (const value of await orderingCollections(clients, {
        ...scope(room.roomId),
        ...paymentIdentityParams(NO_IDENTITY),
      })) {
        const collection = parsePaymentCollection(value);
        if (collection.cancelRequested && collection.status !== "cancelled")
          await cancelOrderCollection(clients, stripe, collection, fetcher);
        else await observeOrderPayment(clients, stripe, collection, fetcher);
      }
    }
    return await result(await readRoom(room.roomId));
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
