import { afterEach, describe, expect, test } from "bun:test";
import {
  groupOrderRequestSchema,
  groupOrderResultSchema,
  groupOrderRoomSchema,
  groupOrderWirePicks,
  type GroupOrderRoom,
} from "../src/lib/mealdeck-group-rooms";
import {
  fetchGroupOrderCapabilities,
  parseGroupOrderInvite,
  previewGroupOrderInvite,
  readRememberedGroupOrderRoom,
  rememberGroupOrderRoom,
  requestGroupOrder,
  resolveGroupOrderRoom,
  safeGroupOrderInviteUrl,
} from "../src/lib/mealdeck-group-rooms-browser";
import { addLaunchPick } from "../src/lib/launch-menu-picks";
import {
  finaliseOrderingSelection,
  handleGroupOrdersRequest,
  orderingActorCookie,
  orderingInviteToken,
  orderingRoomForBrowser,
  readOrderingActor,
} from "../src/lib/mealdeck-group-rooms.server";
import { createHash } from "node:crypto";

const id = (value: number) => "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
const ace = "skorch-burgers-beef-smash-deck-the-ace";
const pick = { brandId: "skorch-burgers", itemId: ace, quantity: 1, selections: {} };
const secret = "s".repeat(43);
const invite = { roomId: id(1), participantId: id(3), token: "t".repeat(43) };
const inviteUrl =
  "https://mealdeck.co.uk/group-order?room=" + id(1) + "#invite=" + id(3) + "&key=" + invite.token;
const room = (): GroupOrderRoom => ({
  schemaVersion: 1,
  roomId: id(1),
  revision: 0,
  phase: "collecting",
  paymentMode: "separate",
  joinDeadline: "2026-11-06T16:03:00Z",
  invitationsClosed: false,
  serverNow: "2026-11-06T16:00:00Z",
  createdAt: "2026-11-06T16:00:00Z",
  fulfilment: "pickup",
  vehicle: null,
  cutleryRequested: true,
  viewer: { participantId: id(2), role: "organiser" },
  people: [
    {
      participantId: id(2),
      name: "Amer",
      isOrganiser: true,
      state: "joined",
      version: 0,
      bagNumber: null,
      shareId: null,
      picks: [],
      paymentState: null,
    },
    {
      participantId: id(3),
      name: "Jay",
      isOrganiser: false,
      state: "invited",
      version: 0,
      bagNumber: null,
      shareId: null,
      picks: [],
      paymentState: null,
    },
  ],
  pendingCount: 1,
  joinedCount: 1,
  readyCount: 0,
  canFinalize: false,
  orderId: null,
  paymentRoomId: null,
});
const result = () => ({
  room: room(),
  payment: null,
  inviteLinks: [{ participantId: id(3), name: "Jay", url: inviteUrl }],
});
const json = (value: unknown, status = 200) => Response.json(value, { status });
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
afterEach(() => {
  if (storageDescriptor) Object.defineProperty(globalThis, "sessionStorage", storageDescriptor);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

describe("one room has strict choices, membership and financial bindings", () => {
  test("prices, fake paid flags, arbitrary participants and unreviewed payments are rejected", () => {
    const save = { action: "save", roomId: id(1), version: 0, picks: [pick] };
    expect(groupOrderRequestSchema.safeParse(save).success).toBe(true);
    for (const value of [
      { ...save, paid: true },
      { ...save, participantId: id(3) },
      { ...save, picks: [{ ...pick, amountPence: 1 }] },
      { ...save, picks: [{ ...pick, key: "derived-key" }] },
      { ...save, version: -1 },
      { ...save, picks: [{ ...pick, quantity: 1.5 }] },
      { action: "pay", roomId: id(1), attemptId: id(9), coverRemaining: false },
    ])
      expect(groupOrderRequestSchema.safeParse(value).success).toBe(false);
    expect(groupOrderWirePicks(addLaunchPick([], pick.brandId, pick.itemId, {}))).toEqual([pick]);
  });
  test("room projection strips contacts, capabilities, provider fields and another person's draft", () => {
    const raw = {
      ...room(),
      ownerEmail: "private@example.invalid",
      actorHash: secret,
      viewer: { participantId: id(3), role: "participant", tokenHash: secret },
      people: room().people.map((person) => ({
        ...person,
        actorHash: secret,
        email: "private@example.invalid",
        picks: [pick],
        choicesExpiresAt: "2026-11-06T16:05:00Z",
        paymentState: "pending",
      })),
    };
    const projected = orderingRoomForBrowser(raw);
    expect(projected.people[0]!.picks).toBeUndefined();
    expect(projected.people[0]!.choicesExpiresAt).toBeUndefined();
    expect(projected.people[1]!.picks).toEqual([pick]);
    expect(projected.people[1]!.choicesExpiresAt).toBe("2026-11-06T16:05:00Z");
    expect(projected.people[0]!.paymentState).toBe("processing");
    expect(projected.vehicle).toBeUndefined();
    expect(JSON.stringify(projected)).not.toMatch(/private@example|actorHash|tokenHash/);
  });
  test("impossible roster counts, foreign bills and participant draft leaks fail closed", () => {
    const valid = room();
    expect(groupOrderRoomSchema.safeParse(valid).success).toBe(true);
    for (const value of [
      { ...valid, readyCount: 1 },
      { ...valid, joinedCount: 2 },
      { ...valid, canFinalize: true },
      { ...valid, paymentRoomId: id(5) },
      { ...valid, viewer: { participantId: id(3), role: "participant" } },
      { ...valid, people: [...valid.people, valid.people[0]] },
    ])
      expect(groupOrderRoomSchema.safeParse(value).success).toBe(false);
    expect(
      groupOrderResultSchema.safeParse({
        ...result(),
        room: { ...valid, orderId: id(5), paymentRoomId: valid.roomId },
      }).success,
    ).toBe(false);
    expect(
      groupOrderResultSchema.safeParse({
        ...result(),
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
      }).success,
    ).toBe(false);
  });
  test("finalisation keeps identical dishes on separate named lines, carries extras and hashes names", () => {
    const value = room();
    value.people.forEach((person) => {
      person.state = "ready";
      person.picks = [structuredClone(pick)];
    });
    value.people[0]!.picks![0]!.crossSelections = [
      {
        slot: "side",
        mode: "extra",
        brandId: "loadd",
        itemId: "loadd-loaded-fries-king-of-hearts",
      },
    ];
    value.pendingCount = 0;
    value.joinedCount = 2;
    value.readyCount = 2;
    value.canFinalize = true;
    const canonical = finaliseOrderingSelection(value, id(99));
    expect(canonical.lines.filter((line) => line.sku === ace)).toHaveLength(2);
    expect(canonical.packingPlan.bags).toEqual([
      {
        number: 1,
        name: "Amer",
        allocations: [
          { lineId: "line-1", quantity: 1 },
          { lineId: "line-1-extra-side", quantity: 1 },
        ],
      },
      { number: 2, name: "Jay", allocations: [{ lineId: "line-2", quantity: 1 }] },
    ]);
    const { requestHash, ...payload } = canonical;
    expect(requestHash).toBe(createHash("sha256").update(JSON.stringify(payload)).digest("hex"));
    value.people[1]!.name = "Alex";
    expect(finaliseOrderingSelection(value, id(99)).requestHash).not.toBe(requestHash);
    value.people[0]!.picks = [];
    expect(finaliseOrderingSelection(value, id(99)).packingPlan.bags).toEqual([
      { number: 1, name: "Alex", allocations: [{ lineId: "line-1", quantity: 1 }] },
    ]);
  });
  test("invalid choices and group-wide quantity overflow cannot become a bill", () => {
    const value = room();
    value.people.forEach((person) => {
      person.state = "ready";
      person.picks = [pick];
    });
    value.people[1]!.picks = [{ ...pick, itemId: "not-a-dish" }];
    expect(() => finaliseOrderingSelection(value, id(99))).toThrow();
    value.people.forEach((person) => {
      person.picks = [20, 20].map((quantity) => ({ ...pick, quantity }));
    });
    expect(() => finaliseOrderingSelection(value, id(99))).toThrow(/60/);
  });
});

describe("room invitations and browser transport do not grant payer identity", () => {
  test("invite secrets are bound to purpose, room and participant and remain in URL fragments", () => {
    const token = orderingInviteToken(secret, id(1), id(3));
    expect(token).toHaveLength(43);
    expect(orderingInviteToken(secret, id(1), id(4))).not.toBe(token);
    expect(orderingInviteToken(secret, id(2), id(3))).not.toBe(token);
    expect(orderingInviteToken("x".repeat(43), id(1), id(3))).not.toBe(token);
    expect(parseGroupOrderInvite(id(1), new URL(inviteUrl).hash)).toEqual(invite);
    expect(safeGroupOrderInviteUrl(inviteUrl, id(1), id(3))).toBe(inviteUrl);
    for (const value of [
      inviteUrl.replace("mealdeck.co.uk", "evil.example"),
      inviteUrl + "&extra=1",
      inviteUrl.replace("?room=", "?key=x&room="),
      inviteUrl.replace("/group-order", "/group-pay"),
      inviteUrl.replace(id(3), id(9)),
      inviteUrl.replace("https://", "http://"),
    ])
      expect(safeGroupOrderInviteUrl(value, id(1), id(3))).toBeNull();
    for (const fragment of [
      "#invite=" + id(3),
      new URL(inviteUrl).hash + "&key=again",
      "#g=oldreply",
    ])
      expect(() => parseGroupOrderInvite(id(1), fragment)).toThrow();
  });
  test("room access cookie is HttpOnly, Secure, host-only and duplicates never select an attacker value", () => {
    const cookie = orderingActorCookie(secret);
    expect(cookie).toContain("__Host-mealdeck-room-actor=");
    expect(cookie).toContain("Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
    const request = (value: string) =>
      new Request("https://mealdeck.co.uk", { headers: { Cookie: value } });
    expect(readOrderingActor(request(cookie))).toBe(secret);
    expect(readOrderingActor(request(cookie + "; " + cookie))).toBeNull();
    expect(readOrderingActor(request("__Host-mealdeck-room-actor=invalid"))).toBeNull();
  });
  test("availability safely bootstraps membership without exposing its capability in JSON", async () => {
    const response = await handleGroupOrdersRequest(
      new Request("https://mealdeck.co.uk/api/group-orders"),
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: false,
      joinWindowSeconds: 180,
      maxPeople: 10,
    });
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const renewed = await handleGroupOrdersRequest(
      new Request("https://mealdeck.co.uk/api/group-orders", {
        headers: { Cookie: orderingActorCookie(secret).split(";")[0]! },
      }),
      {},
    );
    expect(renewed.headers.get("Set-Cookie")).toBe(orderingActorCookie(secret));
  });
  test("guest and capability-only requests never fetch a member token; missing member never falls back", async () => {
    const requests: RequestInit[] = [];
    let tokenReads = 0;
    const tokenGetter = async () => {
      tokenReads++;
      return null;
    };
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init!);
      return json(result());
    }) as typeof fetch;
    await requestGroupOrder(
      { action: "room", roomId: id(1) },
      undefined,
      undefined,
      fetcher,
      tokenGetter,
    );
    await requestGroupOrder(
      { action: "room", roomId: id(1) },
      "guest",
      undefined,
      fetcher,
      tokenGetter,
    );
    expect(tokenReads).toBe(0);
    expect(
      requests.every(
        (request) =>
          request.credentials === "same-origin" &&
          request.cache === "no-store" &&
          !new Headers(request.headers).has("Authorization"),
      ),
    ).toBe(true);
    await expect(
      requestGroupOrder(
        { action: "room", roomId: id(1) },
        "member",
        undefined,
        fetcher,
        tokenGetter,
      ),
    ).rejects.toThrow(/Sign in/);
    expect(requests).toHaveLength(2);
    await expect(
      requestGroupOrder(
        {
          action: "pay",
          roomId: id(1),
          attemptId: id(9),
          coverRemaining: false,
          reviewConfirmed: true,
        },
        undefined,
        undefined,
        fetcher,
      ),
    ).rejects.toThrow(/member or guest/);
  });
  test("cross-room or unsafe responses never become payment/navigation authority", async () => {
    for (const value of [
      { ...result(), room: { ...room(), roomId: id(9) }, inviteLinks: [] },
      {
        ...result(),
        inviteLinks: [
          {
            participantId: id(3),
            name: "Jay",
            url: inviteUrl.replace("mealdeck.co.uk", "evil.example"),
          },
        ],
      },
      { ...result(), payment: { roomId: id(9) } },
      { ...result(), room: { ...room(), actorToken: secret } },
    ])
      await expect(
        requestGroupOrder({ action: "room", roomId: id(1) }, undefined, undefined, (async () =>
          json(value)) as typeof fetch),
      ).rejects.toThrow();
  });
  test("preview is explicit, scoped and never accepts the invitation", async () => {
    let sent: Record<string, unknown> = {};
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return json({
        schemaVersion: 1,
        roomId: id(1),
        participantId: id(3),
        organiserName: "Amer",
        inviteeName: "Jay",
        paymentMode: "separate",
        joinDeadline: room().joinDeadline,
        serverNow: room().serverNow,
        joinable: true,
        message: "Join room",
      });
    }) as typeof fetch;
    expect((await previewGroupOrderInvite(invite, undefined, fetcher)).joinable).toBe(true);
    expect(sent).toEqual({ action: "preview", ...invite });
    await expect(
      previewGroupOrderInvite({ ...invite, participantId: id(4) }, undefined, fetcher),
    ).rejects.toThrow(/does not match/);
  });
  test("only a room UUID is remembered through authentication", () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        setItem: (key: string, value: string) => values.set(key, value),
        getItem: (key: string) => values.get(key),
      },
    });
    expect(rememberGroupOrderRoom(inviteUrl)).toBe(false);
    expect(rememberGroupOrderRoom(id(1))).toBe(true);
    expect([...values.values()]).toEqual([id(1)]);
    expect(readRememberedGroupOrderRoom()).toBe(id(1));
    expect(resolveGroupOrderRoom("")).toBe(id(1));
    expect(() => resolveGroupOrderRoom("?room=" + id(1) + "&room=" + id(2))).toThrow();
  });
  test("availability parsing fails closed on false feature assertions", async () => {
    const fetcher = (async () =>
      json({
        available: true,
        guestEligible: true,
        message: "Ready",
        joinWindowSeconds: 900,
        maxPeople: 10,
      })) as typeof fetch;
    await expect(fetchGroupOrderCapabilities(undefined, fetcher)).rejects.toThrow();
  });
});
