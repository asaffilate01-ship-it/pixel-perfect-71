import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { expect, test } from "bun:test";
import {
  handleOnlineCheckoutRequest,
  handleMealDeckStripeWebhook,
} from "../src/lib/mealdeck-online-checkout.server";
import { handleSharedPaymentsRequest } from "../src/lib/mealdeck-shared-payments.server";
import { parseSharedPaymentResult } from "../src/lib/mealdeck-shared-payments";
import { handleTerminalRequest } from "../src/lib/mealdeck-terminal.server";
import { asActor, createDatabase } from "./postgres/harness.mjs";
import { setupSharedPaymentsFixture } from "./postgres/shared-terminal-payments-fixture.mjs";
import { buildCheckoutDomainSql } from "../deploy/mealdeck/checkout-domain.mjs";
import { buildOrderingRoomsSql } from "../deploy/mealdeck/ordering-rooms.mjs";
import { handleGroupOrdersRequest } from "../src/lib/mealdeck-group-rooms.server";
import { groupOrderResultSchema } from "../src/lib/mealdeck-group-rooms";

/** A real HTTP-handler -> Supabase named-RPC -> PostgreSQL contract test.
 * Auth and Stripe are simulated external services. Mock live-mode data exercises
 * public trading; the transport never performs an external payment call. No RPC result, price,
 * payment state, permission check or kitchen release is mocked.
 * There is deliberately no fallback to global fetch: unexpected URLs fail.
 */
async function integrationFixture(checkoutHostname = "checkout.stripe.com", orderingRooms = false) {
  const db = await createDatabase();
  try {
    const f = await setupSharedPaymentsFixture(db);
    await db.exec(buildCheckoutDomainSql());
    if (orderingRooms) await db.exec(buildOrderingRoomsSql());
    const env = {
      MEALDECK_SUPABASE_URL: "https://paymentintegration.supabase.co",
      MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_payment_integration_fixture",
      MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_payment_integration_fixture",
      MEALDECK_TENANT_ID: f.tenantId,
      MEALDECK_LUTON_LOCATION_ID: f.locationId,
      MEALDECK_STRIPE_SECRET_KEY: "sk_live_" + "a".repeat(32),
      MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
      MEALDECK_STRIPE_ACCOUNT_ID: "acct_Fixture",
      MEALDECK_STRIPE_MODE: "live",
      MEALDECK_STRIPE_CHECKOUT_HOST:
        checkoutHostname === "pay.mealdeck.co.uk" ? checkoutHostname : "",
      MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "signed-off",
      MEALDECK_ONLINE_CHECKOUT_ENABLED: "true",
      MEALDECK_SHARED_PAYMENTS_ENABLED: "true",
      MEALDECK_GROUP_LINK_SECRET: "g".repeat(43),
      MEALDECK_TERMINAL_ENABLED: "true",
      MEALDECK_TERMINAL_INTEGRATION_APPROVED: "signed-off",
      MEALDECK_STRIPE_TERMINAL_LOCATION_ID: "tml_Fixture",
    };
    const tokens = {
      organiser: "o".repeat(48),
      participant: "p".repeat(48),
      staff: "s".repeat(48),
    };
    const users = new Map([
      [tokens.organiser, f.customer],
      [tokens.participant, f.otherCustomer],
      [tokens.staff, f.owner],
    ]);
    const rpcCalls: { name: string; role: string; args: Record<string, unknown> }[] = [];
    const rpcErrors: { name: string; code: string; message: string }[] = [];
    const providerCalls: { path: string; method: string; key: string | null }[] = [];
    const unexpectedRequests: string[] = [];
    let rpcQueue: Promise<unknown> = Promise.resolve();
    let sequence = 0;
    type Intent = {
      id: string;
      amount: number;
      amount_received: number;
      currency: string;
      livemode: boolean;
      status: string;
      capture_method: string;
      payment_method_types: string[];
      metadata: Record<string, string>;
      latest_charge: Record<string, unknown> | null;
      client_secret: string;
    };
    type Session = {
      id: string;
      mode: string;
      status: string;
      payment_status: string;
      amount_total: number;
      currency: string;
      livemode: boolean;
      client_reference_id: string;
      metadata: Record<string, string>;
      payment_intent: Intent | null;
      expires_at: number;
      url: string | null;
    };
    const intents = new Map<string, Intent>();
    const sessions = new Map<string, Session>();
    const events = new Map<string, Record<string, unknown>>();
    const creations = new Map<string, { form: string; response: unknown }>();
    const metadata = (form: URLSearchParams, prefix = "metadata") =>
      Object.fromEntries(
        [...form]
          .filter(([key]) => key.startsWith(prefix + "["))
          .map(([key, value]) => [key.slice(prefix.length + 1, -1), value]),
      );
    const newIntent = (amount: number, meta: Record<string, string>, method: string) => {
      const id = "pi_http" + ++sequence;
      const intent: Intent = {
        id,
        amount,
        amount_received: 0,
        currency: "gbp",
        livemode: true,
        status: "requires_payment_method",
        capture_method: "automatic",
        payment_method_types: [method],
        metadata: meta,
        latest_charge: null,
        client_secret: id + "_secret_fixture",
      };
      intents.set(id, intent);
      return intent;
    };
    const captureIntent = (id: string) => {
      const intent = intents.get(id);
      assert.ok(intent, "The simulated provider must already own the intent");
      intent.status = "succeeded";
      intent.amount_received = intent.amount;
      intent.latest_charge = {
        id: "ch_http" + ++sequence,
        payment_intent: id,
        amount: intent.amount,
        amount_captured: intent.amount,
        amount_refunded: 0,
        disputed: false,
        currency: "gbp",
        livemode: true,
        status: "succeeded",
        paid: true,
        captured: true,
        payment_method_details: { type: intent.payment_method_types[0] },
      };
    };
    const captureSession = (checkoutUrl: string) => {
      const id = new URL(checkoutUrl).pathname.split("/").at(-1)!;
      const session = sessions.get(id);
      assert.ok(session, "Only a created Checkout session can be paid");
      session.payment_intent = newIntent(session.amount_total, session.metadata, "card");
      captureIntent(session.payment_intent.id);
      session.status = "complete";
      session.payment_status = "paid";
      session.url = null;
      return session;
    };
    const bridgeRpc = async (name: string, args: Record<string, unknown>, headers: Headers) => {
      assert.match(name, /^mealdeck_[a-z_]+$/);
      const role =
        headers.get("apikey") === env.MEALDECK_CHECKOUT_SERVER_KEY ? "service_role" : "anon";
      assert.ok(
        [env.MEALDECK_CHECKOUT_SERVER_KEY, env.MEALDECK_SUPABASE_PUBLISHABLE_KEY].includes(
          headers.get("apikey") ?? "",
        ),
      );
      rpcCalls.push({ name, role, args: structuredClone(args) });
      // Ask PostgreSQL for the actual signature. Handwritten parameter maps or
      // a mocked .rpc() could conceal the contract drift this test must detect.
      const candidates = (
        await db.query(
          `select p.proargnames names,
        array(select format_type(t,null) from unnest(p.proargtypes) t) types
        from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1 and p.prokind='f'`,
          [name],
        )
      ).rows;
      const signature = candidates.find(
        (row: { names: string[] }) =>
          row.names.length === Object.keys(args).length &&
          row.names.every((key: string) => Object.hasOwn(args, key)),
      );
      if (!signature) {
        const error = {
          name,
          code: "PGRST202",
          message:
            "No exact named RPC signature: " + name + "(" + Object.keys(args).join(",") + ")",
        };
        rpcErrors.push(error);
        return Response.json(error, { status: 404 });
      }
      const names: string[] = signature.names;
      const types: string[] = signature.types;
      const values = names.map((key, index) =>
        types[index] === "jsonb" && args[key] !== null ? JSON.stringify(args[key]) : args[key],
      );
      for (const key of names) assert.match(key, /^p_[a-z0-9_]+$/);
      try {
        const result = await asActor(
          db,
          null,
          () =>
            db.query(
              `select public.${name}(${names.map((key, index) => '"' + key + '" => $' + (index + 1) + "::" + types[index]).join(",")}) result`,
              values,
            ),
          role,
        );
        return Response.json(result.rows[0].result);
      } catch (error) {
        const failure = {
          name,
          code: (error as { code?: string }).code ?? "XX000",
          message: (error as Error).message,
        };
        rpcErrors.push(failure);
        return Response.json(failure, { status: 400 });
      }
    };
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin === env.MEALDECK_SUPABASE_URL && url.pathname === "/auth/v1/user") {
        const userId = users.get(
          (request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""),
        );
        if (!userId) return Response.json({ message: "Invalid fixture token" }, { status: 401 });
        const user = (
          await db.query(
            "select id,email,email_confirmed_at,is_anonymous from auth.users where id=$1",
            [userId],
          )
        ).rows[0];
        return Response.json(user);
      }
      if (url.origin === env.MEALDECK_SUPABASE_URL && url.pathname.startsWith("/rest/v1/rpc/")) {
        assert.equal(request.method, "POST");
        const name = url.pathname.split("/").at(-1)!;
        const args = (await request.json()) as Record<string, unknown>;
        const pending = rpcQueue.then(() => bridgeRpc(name, args, request.headers));
        rpcQueue = pending.catch(() => undefined);
        return pending;
      }
      if (url.origin === "https://api.stripe.com") {
        assert.equal(
          request.headers.get("Authorization"),
          "Bearer " + env.MEALDECK_STRIPE_SECRET_KEY,
        );
        const path = url.pathname.replace(/^\/v1\//, "");
        const key = request.headers.get("Idempotency-Key");
        providerCalls.push({ path, method: request.method, key });
        if (request.method === "GET") {
          if (path === "account")
            return Response.json({ id: "acct_Fixture", country: "GB", charges_enabled: true });
          if (path === "terminal/locations/tml_Fixture")
            return Response.json({
              id: "tml_Fixture",
              address: { country: "GB" },
              livemode: true,
            });
          if (path.startsWith("checkout/sessions/")) {
            const session = sessions.get(path.split("/").at(-1)!);
            assert.ok(session);
            return Response.json(session);
          }
          if (path.startsWith("payment_intents/")) {
            const intent = intents.get(path.split("/").at(-1)!);
            assert.ok(intent);
            return Response.json(intent);
          }
          if (path.startsWith("events/")) {
            const event = events.get(path.slice("events/".length));
            assert.ok(event);
            return Response.json(event);
          }
        }
        if (request.method === "POST" && ["checkout/sessions", "payment_intents"].includes(path)) {
          const form = new URLSearchParams(await request.text());
          assert.ok(key);
          const prior = creations.get(key);
          if (prior) {
            assert.equal(form.toString(), prior.form);
            return Response.json(prior.response);
          }
          const meta = metadata(form);
          assert.equal(meta.source, "mealdeck");
          let response: unknown;
          if (path === "checkout/sessions") {
            assert.deepEqual(metadata(form, "payment_intent_data[metadata]"), meta);
            const id = "cs_test_http" + ++sequence;
            const session: Session = {
              id,
              mode: form.get("mode")!,
              status: "open",
              payment_status: "unpaid",
              amount_total: Number(form.get("line_items[0][price_data][unit_amount]")),
              currency: form.get("line_items[0][price_data][currency]")!,
              livemode: true,
              client_reference_id: form.get("client_reference_id")!,
              metadata: meta,
              payment_intent: null,
              expires_at: Number(form.get("expires_at")),
              url: "https://" + checkoutHostname + "/c/pay/" + id,
            };
            assert.equal(form.get("line_items[0][quantity]"), "1");
            sessions.set(id, session);
            response = session;
          } else {
            assert.equal(form.get("capture_method"), "automatic");
            response = newIntent(
              Number(form.get("amount")),
              meta,
              form.get("payment_method_types[0]")!,
            );
          }
          creations.set(key, { form: form.toString(), response: structuredClone(response) });
          return Response.json(response);
        }
      }
      unexpectedRequests.push(request.method + " " + request.url);
      throw new Error(
        "External HTTP is disabled in payment integration: " + request.method + " " + request.url,
      );
    }) as typeof fetch;
    const post = async (
      endpoint: "checkout" | "group-payments" | "terminal" | "group-orders",
      body: unknown,
      actor?: keyof typeof tokens,
      cookie?: string,
    ) => {
      const handler =
        endpoint === "checkout"
          ? handleOnlineCheckoutRequest
          : endpoint === "group-orders"
            ? handleGroupOrdersRequest
            : endpoint === "terminal"
              ? handleTerminalRequest
              : handleSharedPaymentsRequest;
      const response = await handler(
        new Request("https://mealdeck.co.uk/api/" + endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://mealdeck.co.uk",
            ...(actor ? { Authorization: "Bearer " + tokens[actor] } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(body),
        }),
        env,
        fetcher,
        () => Date.parse("2026-11-09T00:00:00Z"),
      );
      return { response, body: await response.json() };
    };
    const webhook = async (session: Session) => {
      const event = {
        id: "evt_http" + ++sequence,
        type: "checkout.session.completed",
        livemode: true,
        data: { object: { id: session.id } },
      };
      events.set(event.id, event);
      const raw = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", env.MEALDECK_STRIPE_WEBHOOK_SECRET)
        .update(timestamp + "." + raw)
        .digest("hex");
      return handleMealDeckStripeWebhook(
        new Request("https://mealdeck.co.uk/api/stripe/webhook", {
          method: "POST",
          headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` },
          body: raw,
        }),
        env,
        fetcher,
      );
    };
    return {
      db,
      f,
      env,
      post,
      webhook,
      captureSession,
      captureIntent,
      rpcCalls,
      rpcErrors,
      providerCalls,
      unexpectedRequests,
      intents,
      sessions,
      creations,
      fetcher,
      tokens,
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}

function successful(result: { response: Response; body: unknown }) {
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  expect(result.response.headers.get("Cache-Control")).toContain("no-store");
  return result.body;
}

async function verifyGroupAndPhonePayments(hostname: string) {
  const h = await integrationFixture(hostname);
  try {
    const quoteInput = (quantity: number, group: boolean) => ({
      action: "quote",
      fulfilment: "pickup",
      picks: [{ brandId: "skorch-burgers", itemId: h.f.ace.id, quantity, selections: {} }],
      packing: {
        cutleryRequested: group,
        separateBags: group,
        bagCount: group ? 2 : 1,
        allocations: group
          ? [
              { lineId: "line-1", bag: 1, quantity: 1 },
              { lineId: "line-1", bag: 2, quantity: quantity - 1 },
            ]
          : [],
      },
    });
    const scalar = async (sql: string, args: unknown[] = []) =>
      Object.values((await h.db.query(sql, args)).rows[0])[0];
    const kitchenCount = (order: string) =>
      scalar("select count(*)::int n from public.kds_tickets where order_id=$1", [order]);
    const quote = await h.post("checkout", quoteInput(3, true), "organiser");
    successful(quote);
    expect(quote.body.quote).toMatchObject({
      grossPence: 1197,
      discountPence: 359,
      totalPence: 838,
    });
    const createInput = {
      action: "create",
      quoteId: quote.body.quote.quoteId,
      attemptId: h.f.next(),
      bagCount: 2,
      splitMode: "by_bag",
      reviewConfirmed: true,
    };
    const created = await h.post("group-payments", createInput, "organiser");
    successful(created);
    expect(parseSharedPaymentResult(created.body)).not.toBeNull();
    const room = created.body.room;
    expect(room.shares.map((share: { amountPence: number }) => share.amountPence)).toEqual([
      279, 559,
    ]);
    expect(room).toMatchObject({
      status: "awaiting_payment",
      totalPence: 838,
      paidPence: 0,
      remainingPence: 838,
    });
    expect(await kitchenCount(room.orderId)).toBe(0);
    const retry = await h.post("group-payments", createInput, "organiser");
    successful(retry);
    expect(retry.body.room.orderId).toBe(room.orderId);
    expect(
      await scalar(
        "select count(*)::int n from mealdeck_private.payment_orders where quote_id=$1",
        [quote.body.quote.quoteId],
      ),
    ).toBe(1);

    const invitation = new URL(
      created.body.inviteLinks.find((link: { bagNumber: number }) => link.bagNumber === 2).url,
    );
    const fragment = new URLSearchParams(invitation.hash.slice(1));
    const joined = await h.post("group-payments", {
      action: "join",
      roomId: room.roomId,
      shareId: fragment.get("share"),
      token: fragment.get("key"),
    });
    successful(joined);
    expect(parseSharedPaymentResult(joined.body)).not.toBeNull();
    expect(joined.body.room.viewer.role).toBe("participant");
    expect(joined.body.room.shares).toHaveLength(1);
    expect(joined.body.room.bags[0].number).toBe(2);
    expect(joined.body.room.lines[0].quantity).toBe(2);
    expect(JSON.stringify(joined.body)).not.toMatch(
      /example\.invalid|tokenHash|paymentIntentId|stripeAccount|requestHash|Fixture Customer/,
    );
    expect(JSON.stringify(joined.body)).not.toContain(fragment.get("key")!);
    const cookie = joined.response.headers.get("Set-Cookie")!.split(";")[0]!;
    expect(joined.response.headers.get("Set-Cookie")).toContain("HttpOnly");

    const participantAttempt = h.f.next();
    const participantPay = await h.post(
      "group-payments",
      {
        action: "pay",
        roomId: room.roomId,
        attemptId: participantAttempt,
        coverRemaining: false,
        reviewConfirmed: true,
      },
      "participant",
      cookie,
    );
    successful(participantPay);
    expect(new URL(participantPay.body.checkoutUrl).hostname).toBe(hostname);
    expect(new URL(participantPay.body.checkoutUrl).pathname).toMatch(/^\/c\/pay\/cs_test_http/);
    expect(participantPay.body.resumePayments).toEqual([
      { attemptId: participantAttempt, amountPence: 559, coverRemaining: false },
    ]);
    expect(await kitchenCount(room.orderId)).toBe(0);
    const pending = await h.post(
      "group-payments",
      { action: "reconcile", roomId: room.roomId },
      "organiser",
    );
    successful(pending);
    expect(pending.body.room.paidPence).toBe(0);
    expect(pending.body.resumePayments ?? []).toEqual([]);
    const resume = await h.post(
      "group-payments",
      {
        action: "pay",
        roomId: room.roomId,
        attemptId: participantAttempt,
        coverRemaining: false,
        reviewConfirmed: true,
      },
      "participant",
      cookie,
    );
    successful(resume);
    expect(resume.body.checkoutUrl).toBe(participantPay.body.checkoutUrl);
    expect(h.sessions.size).toBe(1);
    h.captureSession(participantPay.body.checkoutUrl);
    const partial = await h.post(
      "group-payments",
      { action: "reconcile", roomId: room.roomId },
      "organiser",
    );
    successful(partial);
    expect(partial.body.room).toMatchObject({
      status: "partially_paid",
      paidPence: 559,
      remainingPence: 279,
    });
    expect(await kitchenCount(room.orderId)).toBe(0);
    expect(
      await scalar("select payment_status from public.orders where id=$1", [room.orderId]),
    ).toBe("pending");

    const hostPay = await h.post(
      "group-payments",
      {
        action: "pay",
        roomId: room.roomId,
        attemptId: h.f.next(),
        coverRemaining: true,
        reviewConfirmed: true,
      },
      "organiser",
    );
    successful(hostPay);
    const finalSession = h.captureSession(hostPay.body.checkoutUrl);
    const webhook = await h.webhook(finalSession);
    expect(webhook.status).toBe(200);
    expect(await webhook.json()).toEqual({ received: true });
    const paid = await h.post(
      "group-payments",
      { action: "room", roomId: room.roomId },
      "organiser",
    );
    successful(paid);
    expect(paid.body.room).toMatchObject({
      status: "paid",
      totalPence: 838,
      paidPence: 838,
      remainingPence: 0,
      canPay: false,
    });
    expect(paid.body.room.handoffCode).toMatch(/^\d{4}$/);
    expect(await kitchenCount(room.orderId)).toBe(1);
    const settled = await h.post(
      "group-payments",
      { action: "reconcile", roomId: room.roomId },
      "organiser",
    );
    successful(settled);
    expect(await kitchenCount(room.orderId)).toBe(1);
    expect(
      await scalar("select count(*)::int n from public.mealdeck_pass_orders where order_id=$1", [
        room.orderId,
      ]),
    ).toBe(1);
    expect(
      await scalar("select accepted_at from public.orders where id=$1", [room.orderId]),
    ).toBeNull();
    expect(
      await scalar("select count(*)::int n from mealdeck_private.receipt_jobs where order_id=$1", [
        room.orderId,
      ]),
    ).toBe(0);

    const terminalQuote = await h.post("terminal", quoteInput(1, false), "staff");
    successful(terminalQuote);
    expect(terminalQuote.body.quote).toMatchObject({
      grossPence: 399,
      discountPence: 120,
      totalPence: 279,
    });
    const terminalAttempt = h.f.next();
    const prepared = await h.post(
      "terminal",
      {
        action: "prepare",
        quoteId: terminalQuote.body.quote.quoteId,
        attemptId: terminalAttempt,
      },
      "staff",
    );
    successful(prepared);
    expect(prepared.body.action).toBe("collect");
    expect(prepared.body.attempt.id).toBe(terminalAttempt);
    expect(prepared.body.order).toMatchObject({
      totalPence: 279,
      paidPence: 0,
      remainingPence: 279,
      canCollect: true,
    });
    expect(prepared.body.attempt.clientSecret).toBe(
      prepared.body.attempt.paymentIntentId + "_secret_fixture",
    );
    const terminalOrder = prepared.body.order.orderId;
    expect(await kitchenCount(terminalOrder)).toBe(0);
    h.captureIntent(prepared.body.attempt.paymentIntentId);
    const terminalPaid = await h.post(
      "terminal",
      { action: "reconcile", orderId: terminalOrder, attemptId: terminalAttempt },
      "staff",
    );
    successful(terminalPaid);
    expect(terminalPaid.body.action).toBe("none");
    expect(terminalPaid.body.attempt).toMatchObject({
      id: terminalAttempt,
      status: "succeeded",
      clientSecret: null,
    });
    expect(terminalPaid.body.order).toMatchObject({
      status: "paid",
      paidPence: 279,
      remainingPence: 0,
      canCollect: false,
    });
    expect(await kitchenCount(terminalOrder)).toBe(1);
    const lookup = await h.post(
      "terminal",
      { action: "lookup", reference: terminalPaid.body.order.handoffCode },
      "staff",
    );
    successful(lookup);
    expect(lookup.body.order).toMatchObject({
      orderId: terminalOrder,
      status: "paid",
      canCollect: false,
    });
    const providerCount = h.providerCalls.filter(
      (call) => call.method === "POST" && call.path === "payment_intents",
    ).length;
    const again = await h.post(
      "terminal",
      { action: "prepare", orderId: terminalOrder, attemptId: h.f.next() },
      "staff",
    );
    expect(again.response.status).toBe(409);
    expect(again.body.error).toBe("already_paid");
    expect(
      h.providerCalls.filter((call) => call.method === "POST" && call.path === "payment_intents"),
    ).toHaveLength(providerCount);
    expect(
      await scalar(
        "select count(*)::int n from mealdeck_private.payment_collections where order_id=$1",
        [terminalOrder],
      ),
    ).toBe(1);
    expect(await kitchenCount(terminalOrder)).toBe(1);

    expect(h.rpcErrors.filter((error) => error.code === "PGRST202")).toEqual([]);
    expect(
      h.rpcCalls
        .filter((call) => call.name !== "mealdeck_online_checkout_status")
        .every((call) => call.role === "service_role"),
    ).toBe(true);
    expect(
      h.rpcCalls.some(
        (call) => call.name === "mealdeck_online_checkout_status" && call.role === "anon",
      ),
    ).toBe(true);
    const captured = await scalar(
      "select sum(captured_pence)::int n from mealdeck_private.payment_collections",
    );
    expect(captured).toBe(1117);
    expect(h.unexpectedRequests).toEqual([]);
  } finally {
    await h.db.close();
  }
}

test.each(["checkout.stripe.com", "pay.mealdeck.co.uk"])(
  "group and phone HTTP payments through %s execute real scoped SQL and release only after verified full funding",
  verifyGroupAndPhonePayments,
  30_000,
);

test("ordinary custom-domain checkout resumes one saved Session and reconciles even after a domain configuration error", async () => {
  const h = await integrationFixture("pay.mealdeck.co.uk");
  try {
    const quote = await h.post(
      "checkout",
      {
        action: "quote",
        fulfilment: "pickup",
        picks: [{ brandId: "skorch-burgers", itemId: h.f.ace.id, quantity: 1, selections: {} }],
        packing: { cutleryRequested: false, separateBags: false, bagCount: 1, allocations: [] },
      },
      "organiser",
    );
    successful(quote);
    const input = {
      action: "pay",
      quoteId: quote.body.quote.quoteId,
      attemptId: h.f.next(),
      reviewConfirmed: true,
    };
    const paidRequest = await h.post("checkout", input, "organiser");
    successful(paidRequest);
    expect(new URL(paidRequest.body.checkoutUrl).hostname).toBe("pay.mealdeck.co.uk");
    const resumed = await h.post("checkout", input, "organiser");
    successful(resumed);
    expect(resumed.body).toEqual(paidRequest.body);
    expect(
      h.providerCalls.filter((call) => call.method === "POST" && call.path === "checkout/sessions"),
    ).toHaveLength(1);
    expect(h.sessions.size).toBe(1);
    expect(
      (
        await h.db.query(
          "select session_url from mealdeck_private.stripe_orders where order_id=$1",
          [paidRequest.body.orderId],
        )
      ).rows[0].session_url,
    ).toBe(paidRequest.body.checkoutUrl);
    expect((await h.db.query("select count(*)::int n from public.kds_tickets")).rows[0].n).toBe(0);

    const session = h.captureSession(paidRequest.body.checkoutUrl);
    const completedRetry = await h.post("checkout", input, "organiser");
    expect(completedRetry.response.status).toBe(409);
    expect(completedRetry.body.error).toBe("payment_confirmation_pending");
    expect(h.sessions.size).toBe(1);
    expect((await h.db.query("select count(*)::int n from public.kds_tickets")).rows[0].n).toBe(0);

    h.env.MEALDECK_STRIPE_CHECKOUT_HOST = "https://wrong.invalid";
    expect((await h.webhook(session)).status).toBe(200);
    expect((await h.webhook(session)).status).toBe(200);
    const receipt = await h.post(
      "checkout",
      { action: "receipt", orderId: paidRequest.body.orderId },
      "organiser",
    );
    successful(receipt);
    expect(receipt.body.receipt.verifiedPaid).toBe(true);
    expect((await h.db.query("select count(*)::int n from public.kds_tickets")).rows[0].n).toBe(1);
    expect(
      h.providerCalls.filter((call) => call.method === "POST" && call.path === "checkout/sessions"),
    ).toHaveLength(1);
    expect(h.rpcErrors.filter((error) => error.code === "PGRST202")).toEqual([]);
    expect(h.unexpectedRequests).toEqual([]);
  } finally {
    await h.db.close();
  }
}, 30_000);

test.each(["separate", "organiser"])(
  "accepted ordering room with %s payment keeps named bags and releases one fully funded kitchen order",
  async (paymentMode: string) => {
    const h = await integrationFixture("pay.mealdeck.co.uk", true);
    try {
      const session = async () => {
        const response = await handleGroupOrdersRequest(
          new Request("https://mealdeck.co.uk/api/group-orders"),
          h.env,
          h.fetcher,
          () => Date.parse("2026-11-09T00:00:00Z"),
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ available: true, joinWindowSeconds: 180 });
        return response.headers.get("Set-Cookie")!.split(";")[0]!;
      };
      const ownerCookie = await session();
      const participantCookie = await session();
      const strangerCookie = await session();
      const create = {
        action: "create",
        attemptId: h.f.next(),
        name: "  Amer  ",
        inviteNames: ["Jay", "Late"],
        paymentMode,
        fulfilment: "pickup",
        cutleryRequested: true,
      };
      const early = await handleGroupOrdersRequest(
        new Request("https://mealdeck.co.uk/api/group-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://mealdeck.co.uk",
            Authorization: "Bearer " + h.tokens.organiser,
            Cookie: ownerCookie,
          },
          body: JSON.stringify(create),
        }),
        h.env,
        h.fetcher,
        () => Date.parse("2026-11-08T23:59:59Z"),
      );
      expect(early.status).toBe(403);
      expect((await early.json()).error).toBe("group_ordering_not_started");
      expect(
        (await h.db.query("select count(*)::int n from mealdeck_private.ordering_rooms")).rows[0].n,
      ).toBe(0);
      const created = await h.post("group-orders", create, "organiser", ownerCookie);
      successful(created);
      expect(groupOrderResultSchema.safeParse(created.body).success).toBe(true);
      const roomId = created.body.room.roomId;
      expect(created.body.room.people[0].name).toBe("Amer");
      expect(created.body.payment).toBeNull();
      expect(created.body.inviteLinks).toHaveLength(2);
      const retry = await h.post("group-orders", create, "organiser", ownerCookie);
      successful(retry);
      expect(retry.body.room.roomId).toBe(roomId);
      expect(
        (await h.db.query("select count(*)::int n from mealdeck_private.ordering_rooms")).rows[0].n,
      ).toBe(1);

      const fragments = created.body.inviteLinks.map(
        (link: { url: string }) => new URLSearchParams(new URL(link.url).hash.slice(1)),
      );
      const invitation = {
        roomId,
        participantId: fragments[0].get("invite"),
        token: fragments[0].get("key"),
      };
      const preview = await h.post("group-orders", { action: "preview", ...invitation });
      successful(preview);
      expect(preview.body).toMatchObject({
        organiserName: "Amer",
        inviteeName: "Jay",
        joinable: true,
      });
      expect(
        (await h.post("group-orders", { action: "room", roomId }, undefined, ownerCookie)).body.room
          .joinedCount,
      ).toBe(1);
      const joined = await h.post(
        "group-orders",
        { action: "join", ...invitation, name: "Jay" },
        undefined,
        participantCookie,
      );
      successful(joined);
      expect(joined.body.room.people[0].picks).toBeUndefined();
      expect(joined.body.inviteLinks).toBeUndefined();
      expect(joined.body.room.viewer.role).toBe("participant");
      expect(
        (
          await h.post(
            "group-orders",
            { action: "join", ...invitation, name: "Takeover" },
            undefined,
            strangerCookie,
          )
        ).response.status,
      ).toBe(404);
      expect(
        (await h.post("group-orders", { action: "room", roomId }, undefined, strangerCookie))
          .response.status,
      ).toBe(404);
      expect(
        (await h.post("group-orders", { action: "close", roomId }, undefined, participantCookie))
          .response.status,
      ).toBe(403);
      expect(
        (
          await h.post(
            "group-orders",
            {
              action: "save",
              roomId,
              version: 0,
              picks: [],
              participantId: created.body.room.people[0].participantId,
            },
            undefined,
            participantCookie,
          )
        ).response.status,
      ).toBe(400);

      const choose = async (cookie: string, quantity: number) => {
        const current = await h.post("group-orders", { action: "room", roomId }, undefined, cookie);
        successful(current);
        const self = current.body.room.people.find(
          (person: { participantId: string }) =>
            person.participantId === current.body.room.viewer.participantId,
        );
        const saved = await h.post(
          "group-orders",
          {
            action: "save",
            roomId,
            version: self.version,
            picks: [{ brandId: "skorch-burgers", itemId: h.f.ace.id, quantity, selections: {} }],
          },
          undefined,
          cookie,
        );
        successful(saved);
        const person = saved.body.room.people.find(
          (entry: { participantId: string }) => entry.participantId === self.participantId,
        );
        const ready = await h.post(
          "group-orders",
          { action: "ready", roomId, version: person.version, ready: true },
          undefined,
          cookie,
        );
        successful(ready);
        return ready;
      };
      await choose(ownerCookie, 1);
      await choose(participantCookie, 2);
      let current = await h.post(
        "group-orders",
        { action: "room", roomId },
        undefined,
        ownerCookie,
      );
      expect(current.body.room.canFinalize).toBe(false);
      await h.db.query(
        "update mealdeck_private.ordering_rooms set join_deadline=clock_timestamp()-interval '1 second' where id=$1",
        [roomId],
      );
      current = await h.post("group-orders", { action: "room", roomId }, undefined, ownerCookie);
      successful(current);
      expect(current.body.room).toMatchObject({
        pendingCount: 0,
        joinedCount: 2,
        readyCount: 2,
        canFinalize: true,
      });
      expect(current.body.room.people[2].state).toBe("expired");
      expect(
        (
          await h.post(
            "group-orders",
            {
              action: "join",
              roomId,
              participantId: fragments[1].get("invite"),
              token: fragments[1].get("key"),
              name: "Late",
            },
            undefined,
            strangerCookie,
          )
        ).response.status,
      ).toBe(404);
      const freeze = {
        action: "finalize",
        roomId,
        revision: current.body.room.revision,
        attemptId: h.f.next(),
        reviewConfirmed: true,
      };
      const frozen = await h.post("group-orders", freeze, "organiser", ownerCookie);
      successful(frozen);
      const orderId = frozen.body.room.orderId;
      expect(frozen.body.room.phase).toBe("payment");
      expect(frozen.body.payment).toMatchObject({
        totalPence: 838,
        paidPence: 0,
        remainingPence: 838,
      });
      expect(
        frozen.body.payment.shares.map((share: { amountPence: number }) => share.amountPence),
      ).toEqual([279, 559]);
      expect(frozen.body.payment.bags.map((bag: { name: string }) => bag.name)).toEqual([
        "Amer",
        "Jay",
      ]);
      expect(frozen.body.payment.lines).toHaveLength(2);
      expect(
        (await h.post("group-orders", freeze, "organiser", ownerCookie)).body.room.orderId,
      ).toBe(orderId);
      expect((await h.db.query("select count(*)::int n from public.orders")).rows[0].n).toBe(1);
      const kitchenCount = async () =>
        (
          await h.db.query("select count(*)::int n from public.kds_tickets where order_id=$1", [
            orderId,
          ])
        ).rows[0].n;
      expect(await kitchenCount()).toBe(0);
      const own = await h.post(
        "group-orders",
        { action: "room", roomId },
        undefined,
        participantCookie,
      );
      successful(own);
      expect(own.body.payment.bags).toHaveLength(1);
      expect(own.body.payment.bags[0].name).toBe("Jay");
      expect(own.body.payment.shares[0].amountPence).toBe(559);
      expect(
        (await h.post("group-orders", freeze, "participant", participantCookie)).response.status,
      ).toBe(403);
      // Email verification alone is insufficient to pay; an accepted room is
      // still readable while that account completes MealDeck registration.
      const incompleteMember = await h.post(
        "group-orders",
        { action: "room", roomId },
        "staff",
        participantCookie,
      );
      successful(incompleteMember);
      expect(incompleteMember.body.payment.canPay).toBe(false);
      expect(incompleteMember.body.resumePayments).toEqual([]);
      const checkWithoutMembership = await h.post(
        "group-orders",
        { action: "reconcile", roomId },
        "staff",
        participantCookie,
      );
      successful(checkWithoutMembership);
      expect(JSON.stringify(own.body)).not.toMatch(
        /example\.invalid|tokenHash|paymentIntentId|stripeAccount|requestHash|guestId|customerId|actorHash/,
      );
      expect(JSON.stringify(own.body)).not.toContain(invitation.token);
      expect(
        (
          await h.post(
            "group-orders",
            { action: "save", roomId, version: 2, picks: [] },
            undefined,
            participantCookie,
          )
        ).response.status,
      ).toBe(409);
      expect(
        (
          await h.post(
            "group-orders",
            {
              action: "pay",
              roomId,
              attemptId: h.f.next(),
              coverRemaining: true,
              reviewConfirmed: true,
            },
            "participant",
            ownerCookie,
          )
        ).response.status,
      ).toBe(403);

      const participantAttempt = {
        action: "pay",
        roomId,
        attemptId: h.f.next(),
        coverRemaining: false,
        reviewConfirmed: true,
      };
      expect(
        (await h.post("group-orders", participantAttempt, "staff", participantCookie)).response
          .status,
      ).toBe(401);
      const participantPay = await h.post(
        "group-orders",
        participantAttempt,
        "participant",
        participantCookie,
      );
      if (paymentMode === "organiser") {
        expect(participantPay.response.status).toBe(403);
        expect(h.sessions.size).toBe(0);
      } else {
        successful(participantPay);
        expect(participantPay.body.resumePayments).toEqual([
          { attemptId: participantAttempt.attemptId, amountPence: 559, coverRemaining: false },
        ]);
        h.env.MEALDECK_SHARED_PAYMENTS_ENABLED = "false";
        const resumed = await h.post(
          "group-orders",
          participantAttempt,
          "participant",
          participantCookie,
        );
        successful(resumed);
        expect(resumed.body.checkoutUrl).toBe(participantPay.body.checkoutUrl);
        expect(h.sessions.size).toBe(1);
        h.captureSession(participantPay.body.checkoutUrl);
        const partial = await h.post(
          "group-orders",
          { action: "reconcile", roomId },
          undefined,
          ownerCookie,
        );
        successful(partial);
        expect(partial.body.payment).toMatchObject({
          paidPence: 559,
          remainingPence: 279,
          status: "partially_paid",
        });
        expect(partial.body.room.people[1].paymentState).toBe("paid");
        expect(partial.body.room.people[1].state).toBe("ready");
        expect(await kitchenCount()).toBe(0);
        h.env.MEALDECK_SHARED_PAYMENTS_ENABLED = "true";
      }
      const hostPay = await h.post(
        "group-orders",
        {
          action: "pay",
          roomId,
          attemptId: h.f.next(),
          coverRemaining: true,
          reviewConfirmed: true,
        },
        "organiser",
        ownerCookie,
      );
      successful(hostPay);
      expect(hostPay.body.resumePayments[0].amountPence).toBe(
        paymentMode === "organiser" ? 838 : 279,
      );
      for (const creation of h.creations.values()) {
        const form = new URLSearchParams(creation.form);
        expect(form.get("success_url")).toBe("https://mealdeck.co.uk/group-order?room=" + roomId);
        expect(form.get("cancel_url")).toBe(form.get("success_url"));
        expect(creation.form).not.toContain(invitation.token);
      }
      const paidSession = h.captureSession(hostPay.body.checkoutUrl);
      expect((await h.webhook(paidSession)).status).toBe(200);
      expect((await h.webhook(paidSession)).status).toBe(200);
      const paid = await h.post(
        "group-orders",
        { action: "room", roomId },
        undefined,
        participantCookie,
      );
      successful(paid);
      expect(paid.body.payment).toMatchObject({
        status: "paid",
        totalPence: 838,
        paidPence: 838,
        remainingPence: 0,
      });
      expect(
        paid.body.room.people
          .slice(0, 2)
          .map((person: { paymentState: string }) => person.paymentState),
      ).toEqual(["paid", "paid"]);
      expect(await kitchenCount()).toBe(1);
      const items = (
        await h.db.query(
          "select group_participant_name,quantity from public.order_items where order_id=$1 order by checkout_line_id",
          [orderId],
        )
      ).rows;
      expect(items).toEqual([
        { group_participant_name: "Amer", quantity: 1 },
        { group_participant_name: "Jay", quantity: 2 },
      ]);
      const receipt = await h.post("checkout", { action: "receipt", orderId }, "organiser");
      successful(receipt);
      expect(receipt.body.receipt.verifiedPaid).toBe(true);
      expect(
        receipt.body.receipt.packingPlan.bags.map((bag: { name: string }) => bag.name),
      ).toEqual(["Amer", "Jay"]);
      expect(h.rpcErrors.filter((error) => error.code === "PGRST202")).toEqual([]);
      expect(h.unexpectedRequests).toEqual([]);
    } finally {
      await h.db.close();
    }
  },
  30_000,
);
