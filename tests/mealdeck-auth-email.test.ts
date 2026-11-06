import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { Webhook } from "standardwebhooks";
import {
  buildMealDeckAuthEmails,
  handleMealDeckAuthEmail,
  readMealDeckAuthEmailConfig,
} from "../src/lib/mealdeck-auth-email.server";
import {
  AUTH_EMAIL_SITE_ORIGIN,
  authEmailConfirmationUrl,
  readAuthEmailConfirmation,
  safeAuthEmailRedirect,
  safeAuthProviderUrl,
} from "../src/lib/mealdeck-auth-email-links";
import {
  AUTH_EMAIL_KINDS,
  renderMealDeckAuthEmail,
} from "../src/lib/mealdeck-auth-email-templates";
import { customerEmailReturnPath } from "../src/lib/mealdeck-customer-return";

const authOrigin = "https://dedicated-mealdeck.supabase.co";
const keyBytes = Buffer.alloc(32, 42);
const secret = "whsec_" + keyBytes.toString("base64");
const env = {
  MEALDECK_AUTH_EMAIL_ENABLED: "true",
  MEALDECK_SUPABASE_URL: authOrigin,
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" + "a".repeat(32),
  RESEND_API_KEY: "re_" + "fixture".repeat(8),
  MEALDECK_AUTH_EMAIL_FROM: "accounts@notify.mealdeck.co.uk",
  MEALDECK_AUTH_EMAIL_HOOK_SECRET: "v1," + secret,
};
const event = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "current@example.test",
    user_metadata: { name: "<script>untrusted</script>", admin: true },
  },
  email_data: {
    email_action_type: "signup",
    token: "123456",
    token_hash: "pkce_" + "a".repeat(56),
    redirect_to: AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fcheckout%3Fgroup%3D1",
    site_url: "https://ignored-user-field.test",
  },
};
const configuration = readMealDeckAuthEmailConfig(env)!;
function signed(
  body: unknown = event,
  options: {
    raw?: string;
    id?: string;
    seconds?: number;
    key?: string;
    method?: string;
    contentType?: string;
    signature?: string;
  } = {},
) {
  const raw = options.raw ?? JSON.stringify(body);
  const seconds = options.seconds ?? Math.floor(Date.now() / 1000);
  const id = options.id ?? "msg_auth_fixture_1";
  return new Request("https://mealdeck.co.uk/api/auth/email", {
    method: options.method ?? "POST",
    headers: {
      "content-type": options.contentType ?? "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(seconds),
      "webhook-signature":
        options.signature ??
        new Webhook(options.key ?? secret).sign(id, new Date(seconds * 1000), raw),
    },
    ...(options.method === "GET" ? {} : { body: raw }),
  });
}
function provider() {
  const calls: {
    url: string;
    options: RequestInit;
    messages: Record<string, unknown>[];
    key: string;
  }[] = [];
  const accepted = new Map<string, string>();
  const fetcher: typeof fetch = async (input, options) => {
    const messages = JSON.parse(String(options?.body)) as Record<string, unknown>[];
    const key = new Headers(options?.headers).get("idempotency-key")!;
    calls.push({ url: String(input), options: options!, messages, key });
    const raw = String(options?.body);
    if (accepted.has(key) && accepted.get(key) !== raw)
      return Response.json({ message: "key conflict" }, { status: 409 });
    accepted.set(key, raw);
    return Response.json({
      data: messages.map((_, index) => ({
        id: "00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
      })),
    });
  };
  return { fetcher, calls, accepted };
}
function providerLink(email: { text: string }) {
  const link = email.text.match(/https:\/\/mealdeck\.co\.uk\/auth\/confirm#[^\s]+/)![0];
  return new URL(readAuthEmailConfirmation(new URL(link).hash, authOrigin)!);
}

describe("Signed Resend Auth delivery", () => {
  test("is disabled by default and rejects missing, privileged, mixed-project or invalid configuration", async () => {
    const f = provider();
    for (const patch of [
      { MEALDECK_AUTH_EMAIL_ENABLED: undefined },
      { MEALDECK_AUTH_EMAIL_ENABLED: "false" },
      { RESEND_API_KEY: undefined },
      { MEALDECK_AUTH_EMAIL_FROM: "accounts@evil.test" },
      { MEALDECK_AUTH_EMAIL_FROM: "accounts@mealdeck.co.uk\r\nBcc: bad@example.test" },
      { MEALDECK_AUTH_EMAIL_HOOK_SECRET: "v1,whsec_YQ==" },
      { MEALDECK_AUTH_EMAIL_PREVIOUS_HOOK_SECRET: "not-a-secret" },
      { MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_secret_" + "a".repeat(32) },
      { DISHBEE_SUPABASE_URL: "https://another.supabase.co" },
    ]) {
      const config = { ...env, ...patch };
      expect(readMealDeckAuthEmailConfig(config)).toBeNull();
      expect((await handleMealDeckAuthEmail(signed(), config, f.fetcher)).status).toBe(503);
    }
    expect(f.calls).toHaveLength(0);
  });
  test("verifies the raw body, timestamp and ID before sending; accepts independent HMAC fixture", async () => {
    const f = provider();
    const raw = JSON.stringify(event, null, 2);
    const seconds = Math.floor(Date.now() / 1000);
    const signature =
      "v1," +
      createHmac("sha256", keyBytes)
        .update(`msg_auth_fixture_1.${seconds}.${raw}`)
        .digest("base64");
    expect(
      (await handleMealDeckAuthEmail(signed(event, { raw, seconds, signature }), env, f.fetcher))
        .status,
    ).toBe(200);
    for (const options of [
      { raw: raw + " ", seconds, signature },
      { seconds, signature: "v1," + "X".repeat(44) },
      { seconds, signature: "v1a," + signature.slice(3) },
      { seconds: seconds - 301 },
      { seconds: seconds + 301 },
      { id: "not.allowed.id" },
    ])
      expect((await handleMealDeckAuthEmail(signed(event, options), env, f.fetcher)).status).toBe(
        401,
      );
    expect(f.calls).toHaveLength(1);
  });
  test("accepts only the configured rotation secret and does not trust bearer authentication", async () => {
    const other = "whsec_" + Buffer.alloc(32, 7).toString("base64");
    const f = provider();
    expect(
      (await handleMealDeckAuthEmail(signed(event, { key: other }), env, f.fetcher)).status,
    ).toBe(401);
    expect(
      (
        await handleMealDeckAuthEmail(
          signed(event, { key: other }),
          { ...env, MEALDECK_AUTH_EMAIL_PREVIOUS_HOOK_SECRET: other },
          f.fetcher,
        )
      ).status,
    ).toBe(200);
    const request = new Request("https://mealdeck.co.uk/api/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer fake_staff_token" },
      body: JSON.stringify(event),
    });
    expect((await handleMealDeckAuthEmail(request, env, f.fetcher)).status).toBe(401);
    expect(f.calls).toHaveLength(1);
  });
  test("keeps retries and concurrent delivery on the same provider idempotency key", async () => {
    const f = provider();
    const results = await Promise.all([
      handleMealDeckAuthEmail(signed(), env, f.fetcher),
      handleMealDeckAuthEmail(signed(), env, f.fetcher),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(f.accepted.size).toBe(1);
    expect(f.calls[0]!.key).toBe(f.calls[1]!.key);
    expect(f.calls[0]!.url).toBe("https://api.resend.com/emails/batch");
    expect(f.calls[0]!.options.redirect).toBe("error");
    expect(f.calls[0]!.options.cache).toBe("no-store");
    expect(f.calls[0]!.key).not.toContain(event.user.email);
    expect(f.calls[0]!.key).not.toContain(event.email_data.token);
    expect(await results[0]!.json()).toEqual({});
    expect(results[0]!.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(f.calls[0]!.messages)).not.toContain("untrusted");
    expect(JSON.stringify(f.calls[0]!.messages)).not.toContain("ignored-user-field");
  });
  test("a reused event ID with changed content fails without a second accepted email", async () => {
    const f = provider();
    await handleMealDeckAuthEmail(signed(), env, f.fetcher);
    const changed = { ...event, email_data: { ...event.email_data, token: "654321" } };
    expect((await handleMealDeckAuthEmail(signed(changed), env, f.fetcher)).status).toBe(503);
    expect(f.accepted.size).toBe(1);
  });
  test("timeouts, declines and malformed provider replies never claim email success or leak details", async () => {
    for (const reply of [
      async () => {
        throw new Error("private re_secret timeout");
      },
      async () => Response.json({ error: "private recipient" }, { status: 429 }),
      async () => Response.json({ data: [] }),
      async () => Response.json({ data: [{ id: "bad" }] }),
    ]) {
      let calls = 0;
      const response = await handleMealDeckAuthEmail(signed(), env, async () => {
        calls++;
        return reply();
      });
      expect(response.status).toBe(503);
      expect(calls).toBe(1);
      expect(await response.text()).not.toContain("private");
    }
  });
  test("lost provider responses retry the exact request after provider acceptance", async () => {
    const f = provider();
    const lost: typeof fetch = async (...args) => {
      await f.fetcher(...args);
      throw new Error("network lost");
    };
    expect((await handleMealDeckAuthEmail(signed(), env, lost)).status).toBe(503);
    expect((await handleMealDeckAuthEmail(signed(), env, f.fetcher)).status).toBe(200);
    expect(f.accepted.size).toBe(1);
    expect(f.calls[0]!.options.body).toBe(f.calls[1]!.options.body);
  });
  test("rejects GET, non-JSON, oversized streams and unknown action before provider calls", async () => {
    const f = provider();
    expect(
      (await handleMealDeckAuthEmail(signed(event, { method: "GET" }), env, f.fetcher)).status,
    ).toBe(405);
    expect(
      (await handleMealDeckAuthEmail(signed(event, { contentType: "text/plain" }), env, f.fetcher))
        .status,
    ).toBe(415);
    expect(
      (await handleMealDeckAuthEmail(signed(event, { raw: " ".repeat(65_537) }), env, f.fetcher))
        .status,
    ).toBe(413);
    expect(
      (
        await handleMealDeckAuthEmail(
          signed({
            ...event,
            email_data: { ...event.email_data, email_action_type: "mark_verified" },
          }),
          env,
          f.fetcher,
        )
      ).status,
    ).toBe(400);
    expect(f.calls).toHaveLength(0);
  });
});

describe("Auth email content and provider token mapping", () => {
  test("shared-payment sign-in survives both signed delivery and the confirmation interstitial", async () => {
    const redirect = AUTH_EMAIL_SITE_ORIGIN + customerEmailReturnPath("/group-pay");
    expect(redirect).toBe(AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-pay");
    const shared = {
      ...event,
      email_data: { ...event.email_data, email_action_type: "magiclink", redirect_to: redirect },
    };
    const f = provider();
    expect((await handleMealDeckAuthEmail(signed(shared), env, f.fetcher)).status).toBe(200);
    const link = providerLink(f.calls[0]!.messages[0] as { text: string });
    expect(link.searchParams.get("redirect_to")).toBe(redirect);
    expect(link.searchParams.get("token")).toBe(event.email_data.token_hash);
    expect(link.searchParams.get("type")).toBe("magiclink");
    expect(f.calls[0]!.messages[0]!["text"]).not.toContain("room=");
  });
  test("group-room sign-in preserves its fixed return through signed delivery without carrying an invitation", async () => {
    const redirect = AUTH_EMAIL_SITE_ORIGIN + customerEmailReturnPath("/group-order");
    expect(redirect).toBe(AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-order");
    const group = {
      ...event,
      email_data: { ...event.email_data, email_action_type: "magiclink", redirect_to: redirect },
    };
    const f = provider();
    expect((await handleMealDeckAuthEmail(signed(group), env, f.fetcher)).status).toBe(200);
    const link = providerLink(f.calls[0]!.messages[0] as { text: string });
    expect(link.searchParams.get("redirect_to")).toBe(redirect);
    expect(link.searchParams.get("token")).toBe(event.email_data.token_hash);
    expect(link.searchParams.get("type")).toBe("magiclink");
    expect(new URL(redirect).searchParams.get("returnTo")).toBe("/group-order");
    for (const field of ["room=", "participant=", "invite=", "share="])
      expect(f.calls[0]!.messages[0]!["text"]).not.toContain(field);
  });
  test("native OTP default returns keep the code usable in the app without accepting a custom scheme", async () => {
    for (const redirect of [
      undefined,
      "",
      AUTH_EMAIL_SITE_ORIGIN,
      AUTH_EMAIL_SITE_ORIGIN + "/",
      AUTH_EMAIL_SITE_ORIGIN + "/account",
    ]) {
      const data: Record<string, unknown> = { ...event.email_data, email_action_type: "magiclink" };
      if (redirect === undefined) delete data["redirect_to"];
      else data["redirect_to"] = redirect;
      const f = provider();
      expect(
        (await handleMealDeckAuthEmail(signed({ ...event, email_data: data }), env, f.fetcher))
          .status,
      ).toBe(200);
      const message = f.calls[0]!.messages[0] as { text: string };
      expect(message.text).toContain("Your one-time code: 123456");
      expect(providerLink(message).searchParams.get("redirect_to")).toBe(
        AUTH_EMAIL_SITE_ORIGIN + "/account",
      );
    }
    expect(safeAuthEmailRedirect("mealdeck-terminal://account")).toBeNull();
  });
  test("preserves the PKCE provider hash and complete group return without verifying locally", () => {
    const messages = buildMealDeckAuthEmails(event, configuration);
    const link = providerLink(messages[0]!);
    expect(link.origin).toBe(authOrigin);
    expect(link.pathname).toBe("/auth/v1/verify");
    expect(link.searchParams.get("token")).toBe(event.email_data.token_hash);
    expect(link.searchParams.get("type")).toBe("signup");
    expect(link.searchParams.get("redirect_to")).toBe(event.email_data.redirect_to);
    expect(messages[0]!.text).toContain("123456");
    expect(messages[0]!.html).toContain("https://mealdeck.co.uk/email/mealdeck-logo.png");
    expect(messages[0]!.html).not.toContain("email_confirmed_at");
  });
  test("secure email changes send both correctly paired OTPs/hashes in one batch", async () => {
    const change = {
      user: { ...event.user, new_email: "new@example.test" },
      email_data: {
        ...event.email_data,
        email_action_type: "email_change",
        token_new: "654321",
        token_hash: "b".repeat(56),
        token_hash_new: "c".repeat(56),
      },
    };
    const messages = buildMealDeckAuthEmails(change, configuration);
    expect(messages.map((message) => message.to)).toEqual([
      ["current@example.test"],
      ["new@example.test"],
    ]);
    expect(providerLink(messages[0]!).searchParams.get("token")).toBe("c".repeat(56));
    expect(providerLink(messages[1]!).searchParams.get("token")).toBe("b".repeat(56));
    expect(messages[0]!.text).toContain("123456");
    expect(messages[0]!.text).not.toContain("654321");
    expect(messages[1]!.text).toContain("654321");
    const f = provider();
    expect((await handleMealDeckAuthEmail(signed(change), env, f.fetcher)).status).toBe(200);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.messages).toHaveLength(2);
    expect(() =>
      buildMealDeckAuthEmails(
        { ...change, email_data: { ...change.email_data, token_new: "" } },
        configuration,
      ),
    ).toThrow();
  });
  test("single-address changes support either documented token field without mailing the old address", () => {
    for (const tokens of [
      { token: "123456", token_new: "" },
      { token: "", token_new: "654321" },
    ]) {
      const messages = buildMealDeckAuthEmails(
        {
          user: { ...event.user, new_email: "new@example.test" },
          email_data: { ...event.email_data, ...tokens, email_action_type: "email_change" },
        },
        configuration,
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]!.to).toEqual(["new@example.test"]);
    }
  });
  test("security notifications omit codes and send completed email-change notice to the old address", () => {
    for (const kind of AUTH_EMAIL_KINDS.filter((kind) => kind.endsWith("_notification"))) {
      const messages = buildMealDeckAuthEmails(
        {
          ...event,
          email_data: {
            ...event.email_data,
            email_action_type: kind,
            old_email: "old@example.test",
          },
        },
        configuration,
      );
      expect(messages[0]!.to).toEqual([
        kind === "email_changed_notification" ? "old@example.test" : "current@example.test",
      ]);
      expect(messages[0]!.text).not.toContain("123456");
      expect(messages[0]!.text).not.toContain("#confirmation_url");
    }
  });
  test("reauthentication is code-only; all six Auth kinds retain their distinct purpose", () => {
    for (const kind of ["signup", "magiclink", "recovery", "invite", "reauthentication"] as const) {
      const message = buildMealDeckAuthEmails(
        { ...event, email_data: { ...event.email_data, email_action_type: kind } },
        configuration,
      )[0]!;
      expect(message.subject).toContain("MealDeck");
      if (kind === "reauthentication") expect(message.text).not.toContain("#confirmation_url");
      else expect(providerLink(message).searchParams.get("type")).toBe(kind);
    }
  });
  test("renders escaped HTML and plain text without marketing, tokens in image URLs or injected markup", () => {
    const rendered = renderMealDeckAuthEmail("signup", {
      code: '<img src="x" onerror="bad">',
      confirmationUrl: 'https://example.test/" onmouseover="bad',
    });
    expect(rendered.html).not.toContain('<img src="x"');
    expect(rendered.html).toContain("&lt;img");
    for (const kind of AUTH_EMAIL_KINDS) {
      const value = renderMealDeckAuthEmail(kind);
      expect(value.html).toContain('lang="en"');
      expect(value.html).toContain("313 Brands Ltd");
      expect(value.text).toContain("Powered by Dishbee");
      expect(value.html.length).toBeLessThan(20_000);
      expect(value.html).not.toMatch(/30%|99p|loyalty|<script|<form|@import|tracking/i);
    }
  });
});

describe("Confirmation interstitial redirects", () => {
  test("accepts only fixed current customer/staff destinations", () => {
    for (const path of [
      "/account",
      "/ops",
      "/kds",
      "/printer",
      "/account?returnTo=%2Fcheckout",
      "/account?returnTo=%2Fcheckout%3Fgroup%3D1",
      "/account?returnTo=%2Fgroup-pay",
      "/account?returnTo=%2Fgroup-order",
    ])
      expect(safeAuthEmailRedirect(AUTH_EMAIL_SITE_ORIGIN + path)).toBe(
        AUTH_EMAIL_SITE_ORIGIN + path,
      );
    expect(safeAuthEmailRedirect(AUTH_EMAIL_SITE_ORIGIN + "/")).toBe(
      AUTH_EMAIL_SITE_ORIGIN + "/account",
    );
    for (const value of [
      "https://evil.test/account",
      "//evil.test",
      "https://mealdeck.co.uk.evil.test/account",
      "https://user@mealdeck.co.uk/account",
      "http://mealdeck.co.uk/account",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=https://evil.test",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fops",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fcheckout&extra=1",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-pay&room=private",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-pay%3Froom%3Dprivate",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-pay&returnTo=https://evil.test",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-order&room=private",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-order%3Froom%3Dprivate",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-order%23token%3Dsecret",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-order&invite=secret",
      AUTH_EMAIL_SITE_ORIGIN + "/account?returnTo=%2Fgroup-order&returnTo=https://evil.test",
      AUTH_EMAIL_SITE_ORIGIN + "/account#token",
      AUTH_EMAIL_SITE_ORIGIN + "/api/terminal",
    ])
      expect(safeAuthEmailRedirect(value)).toBeNull();
  });
  test("rejects foreign project, injected query, duplicate field and unsafe provider links", () => {
    const good = providerLink(buildMealDeckAuthEmails(event, configuration)[0]!).href;
    for (const value of [
      good.replace(authOrigin, "https://foreign.supabase.co"),
      good + "&token=" + "b".repeat(56),
      good + "&next=https://evil.test",
      good + "#access_token=secret",
      good.replace("/auth/v1/verify", "/auth/v1/admin/users"),
      "javascript:alert(1)",
    ])
      expect(safeAuthProviderUrl(value, authOrigin)).toBeNull();
    const fragment = new URL(authEmailConfirmationUrl(good)).hash;
    expect(readAuthEmailConfirmation(fragment, authOrigin)).toBe(good);
    expect(readAuthEmailConfirmation(fragment + "&confirmation_url=x", authOrigin)).toBeNull();
    expect(readAuthEmailConfirmation("", authOrigin)).toBeNull();
  });
  test("page load does not fetch/verify the token; explicit button owns the provider navigation", () => {
    const source = readFileSync(
      new URL("../src/components/auth-email-confirmation.tsx", import.meta.url),
      "utf8",
    );
    const effect = source.slice(source.indexOf("useEffect(()"), source.indexOf("return ("));
    expect(effect).not.toContain("location.assign");
    expect(source).not.toMatch(/verifyOtp|exchangeCodeForSession|signInWithOtp|fetch\(/);
    expect(source).toContain("window.history.replaceState");
    expect(source).toContain("window.location.assign(providerUrl)");
    const route = readFileSync(new URL("../src/routes/auth.confirm.tsx", import.meta.url), "utf8");
    expect(route).toContain("noindex, nofollow, noarchive");
    expect(route).toContain("no-store, private");
    expect(route).toContain("no-referrer");
  });
  test("SMTP templates preserve provider variables while keeping GET links on the interstitial", () => {
    const html = readFileSync(new URL("../emails/auth/signup.html", import.meta.url), "utf8");
    expect(html).toContain("#confirmation_url={{ .ConfirmationURL | urlquery }}");
    expect(html).toContain("{{ .Token }}");
    expect(html).not.toContain('href="{{ .ConfirmationURL }}"');
  });
  test("all link-bearing SMTP previews keep tokens in fragments and preserve the shared-payment return", () => {
    const providerUrl = new URL("/auth/v1/verify", authOrigin);
    providerUrl.search = new URLSearchParams({
      token: event.email_data.token_hash,
      type: "magiclink",
      redirect_to: AUTH_EMAIL_SITE_ORIGIN + customerEmailReturnPath("/group-pay"),
    }).toString();
    for (const kind of ["signup", "magiclink", "recovery", "invite", "email_change"]) {
      const template = readFileSync(
        new URL(`../emails/auth/${kind}.html`, import.meta.url),
        "utf8",
      );
      const html = template
        .replaceAll("{{ .ConfirmationURL | urlquery }}", encodeURIComponent(providerUrl.href))
        .replaceAll("{{ .Token }}", "123456");
      const links = [...html.matchAll(/href="([^"]+)"/g)].map(
        (match) => new URL(match[1]!.replaceAll("&amp;", "&")),
      );
      const confirmation = links.find((link) => link.pathname === "/auth/confirm")!;
      expect(confirmation.origin).toBe(AUTH_EMAIL_SITE_ORIGIN);
      expect(confirmation.search).toBe("");
      expect(readAuthEmailConfirmation(confirmation.hash, authOrigin)).toBe(providerUrl.href);
      expect(links.some((link) => link.origin === authOrigin)).toBe(false);
      // An ordinary HTTP GET omits the fragment and therefore all one-time material.
      expect(confirmation.origin + confirmation.pathname + confirmation.search).toBe(
        AUTH_EMAIL_SITE_ORIGIN + "/auth/confirm",
      );
    }
  });
});
