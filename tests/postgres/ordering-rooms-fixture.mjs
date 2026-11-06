import assert from "node:assert/strict";
import { setupSharedPaymentsFixture, paymentHash } from "./shared-terminal-payments-fixture.mjs";
import { buildCheckoutDomainSql } from "../../deploy/mealdeck/checkout-domain.mjs";
import { buildOrderingRoomsSql } from "../../deploy/mealdeck/ordering-rooms.mjs";

export const orderingRpcNames = [
  "mealdeck_create_ordering_room",
  "mealdeck_ordering_invitation",
  "mealdeck_accept_ordering_invitation",
  "mealdeck_ordering_room_status",
  "mealdeck_update_ordering_choices",
  "mealdeck_set_ordering_ready",
  "mealdeck_leave_ordering_room",
  "mealdeck_remove_ordering_invitation",
  "mealdeck_close_ordering_invitations",
  "mealdeck_finalize_ordering_room",
  "mealdeck_ordering_payment_access",
  "mealdeck_ordering_payment_status",
  "mealdeck_ordering_payment_collections",
  "mealdeck_cancel_ordering_room",
];

export async function setupOrderingRoomsFixture(db, { install = true } = {}) {
  const f = await setupSharedPaymentsFixture(db);
  await db.exec(buildCheckoutDomainSql());
  if (install) await db.exec(buildOrderingRoomsSql());
  const call = (client, name, values) => {
    assert.ok(orderingRpcNames.includes(name));
    return client.query(
      `select public.${name}(${values.map((_, index) => "$" + (index + 1)).join(",")}) result`,
      values,
    );
  };
  const rpc = (name, values) =>
    f.service(async () => (await call(db, name, values)).rows[0].result);
  const pick = (quantity = 1) => ({
    brandId: "skorch-burgers",
    itemId: f.line.sku,
    quantity,
    selections: {},
  });
  const room = async (options = {}) => {
    const roomId = f.next();
    const ownerHash = paymentHash(f.next());
    const invitations = Array.from({ length: options.inviteCount ?? 1 }, (_, index) => ({
      participantId: f.next(),
      name: "Guest " + (index + 1),
      tokenHash: paymentHash(f.next()),
    }));
    const actors = [ownerHash, ...invitations.map(() => paymentHash(f.next()))];
    const args = [
      roomId,
      f.next(),
      f.tenantId,
      f.locationId,
      ownerHash,
      options.guestToken ? null : (options.customer ?? f.customer),
      options.guestToken ?? null,
      options.name ?? "Amer",
      options.mode ?? "separate",
      options.fulfilment ?? "pickup",
      options.vehicle ? JSON.stringify(options.vehicle) : null,
      options.cutlery ?? true,
      JSON.stringify(invitations),
    ];
    const snapshot = await rpc("mealdeck_create_ordering_room", args);
    return { roomId, actors, invitations, args, snapshot };
  };
  const status = (r, index = 0) =>
    rpc("mealdeck_ordering_room_status", [r.roomId, r.actors[index]]);
  const accept = (r, index = 1, name = r.invitations[index - 1].name) =>
    rpc("mealdeck_accept_ordering_invitation", [
      r.roomId,
      r.invitations[index - 1].tokenHash,
      r.actors[index],
      name,
    ]);
  const ownPerson = (snapshot) =>
    snapshot.people.find((person) => person.participantId === snapshot.viewer.participantId);
  const choose = async (r, index = 0, picks = [pick()]) =>
    rpc("mealdeck_update_ordering_choices", [
      r.roomId,
      r.actors[index],
      ownPerson(await status(r, index)).version,
      JSON.stringify(picks),
    ]);
  const ready = async (r, index = 0, value = true) =>
    rpc("mealdeck_set_ordering_ready", [
      r.roomId,
      r.actors[index],
      ownPerson(await status(r, index)).version,
      value,
    ]);
  const readyRoom = async (options = {}) => {
    const r = await room(options);
    for (let index = 1; index < r.actors.length; index++) await accept(r, index);
    for (let index = 0; index < r.actors.length; index++) {
      if (index !== 0 || !options.emptyOrganiser) await choose(r, index, [pick(index + 1)]);
      await ready(r, index);
    }
    r.snapshot = await status(r);
    return r;
  };
  const freezeArgs = async (r, options = {}) => {
    const snapshot = options.snapshot ?? (await status(r));
    const people = snapshot.people.filter(
      (person) => person.state === "ready" && person.picks?.length,
    );
    const lines = [];
    const packing = {
      version: 1,
      separateBags: true,
      cutleryRequested: snapshot.cutleryRequested,
      bags: people.map((person, index) => ({
        number: index + 1,
        name: person.name,
        allocations: person.picks.map((pick) => {
          const lineId = "line-" + (lines.length + 1);
          lines.push({ ...f.line, lineId, sku: pick.itemId, quantity: pick.quantity });
          return { lineId, quantity: pick.quantity };
        }),
      })),
    };
    const tokens = packing.bags.map((bag) => ({
      shareId: f.next(),
      bagNumber: bag.number,
      tokenHash: paymentHash(f.next()),
    }));
    const args = [
      r.roomId,
      r.actors[0],
      r.args[5],
      r.args[6],
      snapshot.revision,
      JSON.stringify(lines),
      JSON.stringify(packing),
      paymentHash(
        JSON.stringify({
          fulfilment: snapshot.fulfilment,
          vehicle: snapshot.vehicle,
          lines,
          packingPlan: packing,
        }),
      ),
      f.next(),
      JSON.stringify(tokens),
      "acct_Fixture",
      false,
    ];
    return { args, lines, packing, tokens };
  };
  const freeze = async (r, options = {}) => {
    const data = options.data ?? (await freezeArgs(r, options));
    const snapshot = await rpc("mealdeck_finalize_ordering_room", data.args);
    return { ...data, r, snapshot, room: await paymentStatus(r) };
  };
  const access = (r, index = 0, options = {}) =>
    rpc("mealdeck_ordering_payment_access", [
      r.roomId,
      r.actors[index],
      options.guestToken
        ? null
        : (options.customer ?? (index === 0 ? f.customer : f.otherCustomer)),
      options.guestToken ?? null,
      options.cover ?? false,
    ]);
  const paymentStatus = (r, index = 0) =>
    rpc("mealdeck_ordering_payment_status", [r.roomId, r.actors[index]]);
  const collections = (r, index = 0, customer = null, guest = null) =>
    rpc("mealdeck_ordering_payment_collections", [r.roomId, r.actors[index], customer, guest]);
  const claim = async (r, index = 0, options = {}) => {
    const a = await access(r, index, options);
    return f.rpc("mealdeck_prepare_group_payment", [
      r.roomId,
      options.guestToken
        ? null
        : (options.customer ?? (index === 0 ? f.customer : f.otherCustomer)),
      options.guestToken ?? null,
      a.shareTokenHash,
      options.cover ?? false,
      options.attempt ?? f.next(),
      "acct_Fixture",
      false,
    ]);
  };
  const bind = (c, options = {}) =>
    f.bindPayment(c, {
      ...options,
      url: options.url ?? "https://pay.mealdeck.co.uk/c/pay/cs_test_ordering",
    });
  return {
    ...f,
    ordering: {
      call,
      rpc,
      pick,
      room,
      status,
      accept,
      ownPerson,
      choose,
      ready,
      readyRoom,
      freezeArgs,
      freeze,
      access,
      paymentStatus,
      collections,
      claim,
      bind,
    },
  };
}
