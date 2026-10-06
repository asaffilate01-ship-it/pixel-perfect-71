import { describe, expect, test } from "bun:test";
import {
  handleFranchiseRequest,
  validateFranchiseEnquiry,
  type FranchiseFetch,
} from "../src/lib/franchise-api";
import { DEFAULT_PROGRAMME, OFFER_VERSION } from "../src/lib/franchise-offer";

const FORM_URL = "https://mealdeck.example.invalid/api/franchise";
const API_URL = "https://franchise.example.invalid/api/public/network-expansion";
const answers = {
  offerVersion: OFFER_VERSION,
  operatingExperience: "I have managed a food service team.",
  setupPackageAcknowledged: true,
  operatorResponsibilitiesAcknowledged: true,
  selectedTerritory: null,
};

function enquiry(overrides: Record<string, unknown> = {}) {
  return {
    programmeKey: "mealdeck-england-wales",
    territoryCode: null,
    name: "Example Operator",
    email: "operator@example.invalid",
    phone: null,
    preferredArea: "Example town",
    existingKitchen: false,
    existingBusiness: null,
    availableCapitalMinor: 4_000_000,
    launchTiming: "3–6 months",
    multiUnitInterest: false,
    operatorModel: "owner_operator",
    source: "mealdeck-franchise-page",
    utm: {},
    consent: true,
    website: "",
    answers: { ...answers },
    ...overrides,
  };
}

function post(input: unknown = enquiry(), headers: Record<string, string> = {}) {
  return new Request(FORM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: new URL(FORM_URL).origin, ...headers },
    body: JSON.stringify(input),
  });
}

function territory(overrides: Record<string, unknown> = {}) {
  return {
    code: "MD-999",
    name: "Example territory",
    region: "London",
    status: "available",
    isSellable: true,
    fee: 20_000,
    currency: "GBP",
    ...overrides,
  };
}

function publicResponse(territories: unknown[] = []) {
  return Response.json({
    programme: { key: "mealdeck-england-wales" },
    territories,
  });
}

function forbiddenFetch(): FranchiseFetch {
  return async () => { throw new Error("Unexpected upstream request"); };
}

describe("franchise enquiry validation", () => {
  test("trims details, keeps zero capital and strips unapproved fields", () => {
    const result = validateFranchiseEnquiry(enquiry({
      name: "  Example Operator  ",
      email: " OPERATOR@EXAMPLE.INVALID ",
      availableCapitalMinor: 0,
      privateMetadata: { approved: true },
      utm: { utm_source: "newsletter", arbitrary: "not forwarded" },
      answers: { ...answers, privateDecision: "not forwarded" },
    }));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected a valid enquiry");
    expect(result.data.name).toBe("Example Operator");
    expect(result.data.email).toBe("operator@example.invalid");
    expect(result.data.availableCapitalMinor).toBe(0);
    expect(result.data.marketingConsent).toBe(false);
    expect(result.data.utm).toEqual({ utm_source: "newsletter" });
    expect("privateMetadata" in result.data).toBe(false);
    expect("privateDecision" in result.data.answers).toBe(false);
  });

  const invalid: Array<[string, unknown]> = [
    ["an array", []],
    ["null", null],
    ["missing contact permission", enquiry({ consent: false })],
    ["unsolicited marketing permission", enquiry({ marketingConsent: true })],
    ["a bot honeypot", enquiry({ website: "https://example.invalid" })],
    ["a different programme", enquiry({ programmeKey: "another-business" })],
    ["a different source", enquiry({ source: "another-form" })],
    ["a managed investor model", enquiry({ operatorModel: "managed_investor" })],
    ["negative capital", enquiry({ availableCapitalMinor: -1 })],
    ["fractional pence", enquiry({ availableCapitalMinor: 2.5 })],
    ["non-finite capital", enquiry({ availableCapitalMinor: Infinity })],
    ["capital beyond £10m", enquiry({ availableCapitalMinor: 1_000_000_001 })],
    ["numeric text as capital", enquiry({ availableCapitalMinor: "100000" })],
    ["an invalid email", enquiry({ email: "not-an-email" })],
    ["an oversized name", enquiry({ name: "a".repeat(121) })],
    ["an oversized phone", enquiry({ phone: "1".repeat(41) })],
    ["an oversized area", enquiry({ preferredArea: "a".repeat(161) })],
    ["an oversized business", enquiry({ existingBusiness: "a".repeat(201) })],
    ["an oversized timing", enquiry({ launchTiming: "a".repeat(81) })],
    ["an oversized experience", enquiry({ answers: { ...answers, operatingExperience: "a".repeat(2001) } })],
    ["an obsolete offer", enquiry({ answers: { ...answers, offerVersion: "2026-01-01" } })],
    ["missing setup acknowledgement", enquiry({ answers: { ...answers, setupPackageAcknowledged: false } })],
    ["missing operations acknowledgement", enquiry({ answers: { ...answers, operatorResponsibilitiesAcknowledged: false } })],
  ];
  for (const [name, input] of invalid) {
    test("rejects " + name, () => {
      expect(validateFranchiseEnquiry(input).success).toBe(false);
    });
  }

  test("accepts optional fields, new operator defaults and the maximum capital", () => {
    const result = validateFranchiseEnquiry({
      name: "Example Operator",
      email: "operator@example.invalid",
      preferredArea: "Example town",
      availableCapitalMinor: 1_000_000_000,
      consent: true,
      answers: { ...answers },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected a valid enquiry");
    expect(result.data.operatorModel).toBe("owner_operator");
    expect(result.data.territoryCode).toBeNull();
    expect(result.data.phone).toBeNull();
    expect(result.data.marketingConsent).toBe(false);
  });
});

describe("franchise request boundary", () => {
  test("missing configuration cannot produce a success", async () => {
    for (const request of [new Request(FORM_URL), post()]) {
      let calls = 0;
      const response = await handleFranchiseRequest(request, {
        fetchImpl: async () => { calls++; return Response.json({ ok: true }); },
      });
      expect(calls).toBe(0);
      expect(response.status).toBe(503);
      expect((await response.json()).ok).toBe(false);
    }
  });

  for (const apiUrl of [
    "not a URL",
    "http://franchise.example.invalid",
    "https://user:password@franchise.example.invalid",
    "file:///private/config",
    "https://franchise.example.invalid/#credential",
    "http://localhost:3000/api/public/network-expansion",
  ]) {
    test("rejects unsafe server URL " + apiUrl.split(":")[0], async () => {
      let calls = 0;
      const response = await handleFranchiseRequest(post(), {
        apiUrl,
        fetchImpl: async () => { calls++; return Response.json({ ok: true }); },
      });
      expect(calls).toBe(0);
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).not.toContain("password");
      expect(text).not.toContain("OMNIQORA");
    });
  }

  test("localhost HTTP is permitted only when explicitly enabled", async () => {
    const response = await handleFranchiseRequest(post(), {
      apiUrl: "http://localhost:3000/api/public/network-expansion",
      allowInsecureLocalhost: true,
      fetchImpl: async () => Response.json({ ok: true, applicationId: "app-1" }),
    });
    expect(response.status).toBe(201);
  });

  test("rejects a cross-origin JSON submission before contacting the service", async () => {
    const response = await handleFranchiseRequest(post(enquiry(), { Origin: "https://elsewhere.example.invalid" }), {
      apiUrl: API_URL,
      fetchImpl: forbiddenFetch(),
    });
    expect(response.status).toBe(403);
  });

  test("permits server-to-server requests without a browser Origin", async () => {
    const request = post();
    request.headers.delete("origin");
    const response = await handleFranchiseRequest(request, {
      apiUrl: API_URL,
      fetchImpl: async () => Response.json({ ok: true, applicationId: "app-1" }),
    });
    expect(response.status).toBe(201);
  });

  test("rejects a form-urlencoded body", async () => {
    const response = await handleFranchiseRequest(post(enquiry(), { "Content-Type": "application/x-www-form-urlencoded" }), {
      apiUrl: API_URL,
      fetchImpl: forbiddenFetch(),
    });
    expect(response.status).toBe(415);
  });

  test("rejects malformed JSON and array roots", async () => {
    for (const body of ["{invalid", "[]", "null"]) {
      const response = await handleFranchiseRequest(new Request(FORM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }), { apiUrl: API_URL, fetchImpl: forbiddenFetch() });
      expect(response.status).toBe(400);
    }
  });

  test("rejects oversized UTF-8 bytes even without a content-length header", async () => {
    const response = await handleFranchiseRequest(post(enquiry({ extra: "£".repeat(9000) })), {
      apiUrl: API_URL,
      fetchImpl: forbiddenFetch(),
    });
    expect(response.status).toBe(413);
  });

  test("rejects a populated honeypot instead of showing fake receipt", async () => {
    const response = await handleFranchiseRequest(post(enquiry({ website: "spam" })), {
      apiUrl: API_URL,
      fetchImpl: forbiddenFetch(),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });

  test("only the public programme query is accepted", async () => {
    for (const query of ["?programme=other", "?target=https://elsewhere.example.invalid", "?q=arbitrary", "?programme=mealdeck-england-wales&programme=other"]) {
      const response = await handleFranchiseRequest(new Request(FORM_URL + query), {
        apiUrl: API_URL,
        fetchImpl: forbiddenFetch(),
      });
      expect(response.status).toBe(400);
    }
  });

  test("returns a JSON 405 for unsupported methods", async () => {
    const response = await handleFranchiseRequest(new Request(FORM_URL, { method: "DELETE" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
  });
});

describe("public franchise data", () => {
  test("exposes reviewed programme terms and public territory fields only", async () => {
    const response = await handleFranchiseRequest(new Request(FORM_URL), {
      apiUrl: API_URL,
      fetchImpl: async () => Response.json({
        programme: { key: "mealdeck-england-wales", royaltyPercent: 99, internalNotes: "SECRET" },
        privateApiKey: "SECRET",
        territories: [territory({ metadata: { owner: "SECRET" }, internalNotes: "SECRET", note: "SECRET", score: 90 })],
      }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.programme).toEqual(DEFAULT_PROGRAMME);
    expect(result.territories[0]).toEqual(territory());
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("an empty live list stays empty", async () => {
    const response = await handleFranchiseRequest(new Request(FORM_URL), {
      apiUrl: API_URL,
      fetchImpl: async () => publicResponse(),
    });
    expect((await response.json()).territories).toEqual([]);
  });

  for (const payload of [{}, { programme: { key: "other" }, territories: [] }, { programme: { key: "mealdeck-england-wales" }, territories: {} }]) {
    test("rejects malformed or mismatched public programme data", async () => {
      const response = await handleFranchiseRequest(new Request(FORM_URL), {
        apiUrl: API_URL,
        fetchImpl: async () => Response.json(payload),
      });
      expect(response.status).toBe(502);
    });
  }

  test("known committed anchors cannot reappear as available", async () => {
    const names = ["Luton / Dunstable", "St Albans", "Bedford", "Milton Keynes", "Islington / Camden"];
    const response = await handleFranchiseRequest(new Request(FORM_URL), {
      apiUrl: API_URL,
      fetchImpl: async () => publicResponse(names.map((name, i) => territory({ code: "MD-" + i, name }))),
    });
    const result = await response.json();
    expect(result.territories).toHaveLength(5);
    expect(result.territories.every((item: { status: string; isSellable: boolean }) =>
      item.status === "taken" && item.isSellable === false)).toBe(true);
  });
});

describe("submission, territory verification and receipts", () => {
  test("verifies the territory, forwards canonical answers and omits caller credentials", async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    const response = await handleFranchiseRequest(post(enquiry({
      territoryCode: "MD-999",
      answers: { ...answers, selectedTerritory: "Forged label" },
    }), { Authorization: "Bearer browser-secret", Cookie: "session=browser-secret" }), {
      apiUrl: API_URL + "?unapproved=query",
      fetchImpl: async (url, init) => {
        calls.push({ url: new URL(url), init });
        return init.method === "GET" ? publicResponse([territory()]) :
          Response.json({ ok: true, applicationId: "app-123", score: 90, internalNotes: "private" }, { status: 201 });
      },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, reference: "app-123" });
    expect(calls.map((call) => call.init.method)).toEqual(["GET", "POST"]);
    expect([...calls[0]!.url.searchParams.keys()]).toEqual(["programme"]);
    expect(calls[0]!.url.searchParams.get("programme")).toBe("mealdeck-england-wales");
    const headers = new Headers(calls[1]!.init.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(calls[1]!.init.redirect).toBe("error");
    const sent = JSON.parse(String(calls[1]!.init.body));
    expect(sent.answers).toEqual({ ...answers, selectedTerritory: "Example territory" });
    expect(sent.marketingConsent).toBe(false);
    expect(sent.source).toBe("mealdeck-franchise-page");
  });

  for (const unavailable of [
    [],
    [territory({ status: "reserved" })],
    [territory({ status: "coming_soon" })],
    [territory({ status: "unknown" })],
    [territory({ isSellable: false })],
    [territory({ name: "Islington / Camden" })],
    [territory(), territory({ status: "taken" })],
  ]) {
    test("does not submit when the selected territory is unavailable or contradictory", async () => {
      let calls = 0;
      const response = await handleFranchiseRequest(post(enquiry({ territoryCode: "MD-999" })), {
        apiUrl: API_URL,
        fetchImpl: async (_url, init) => {
          calls++;
          expect(init.method).toBe("GET");
          return publicResponse(unavailable);
        },
      });
      expect(response.status).toBe(409);
      expect(calls).toBe(1);
    });
  }

  test("accepts a general nearby-area enquiry without implying a territory hold", async () => {
    const response = await handleFranchiseRequest(post(enquiry({
      preferredArea: "Bedford and surrounding towns",
      answers: { ...answers, selectedTerritory: "Bedford" },
    })), {
      apiUrl: API_URL,
      fetchImpl: async (_url, init) => {
        expect(init.method).toBe("POST");
        const data = JSON.parse(String(init.body));
        expect(data.territoryCode).toBeNull();
        expect(data.answers.selectedTerritory).toBeNull();
        return Response.json({ ok: true, applicationId: "app-123" });
      },
    });
    expect(response.status).toBe(201);
  });

  for (const payload of [
    {},
    { message: "hello" },
    { reference: "request-reference-without-receipt" },
    { ok: false, applicationId: "app-123", error: "private database detail" },
    { success: false, id: "app-123" },
    { ok: true, error: "private database detail" },
    { status: "failed", id: "app-123" },
  ]) {
    test("rejects ambiguous or failed JSON instead of claiming receipt", async () => {
      const response = await handleFranchiseRequest(post(), {
        apiUrl: API_URL,
        fetchImpl: async () => Response.json(payload),
      });
      expect(response.status).toBe(502);
      expect((await response.text())).not.toContain("private database");
    });
  }

  for (const acknowledgement of [{ ok: true }, { success: true }, { status: "success" }]) {
    test("rejects a success acknowledgement without proof the enquiry was saved", async () => {
      const response = await handleFranchiseRequest(post(), {
        apiUrl: API_URL,
        fetchImpl: async () => Response.json(acknowledgement),
      });
      expect(response.status).toBe(502);
      expect((await response.json()).ok).toBe(false);
    });
  }

  test("accepts an application id returned after persistence", async () => {
    const response = await handleFranchiseRequest(post(), {
      apiUrl: API_URL,
      fetchImpl: async () => Response.json({ applicationId: "app-123" }, { status: 201 }),
    });
    expect(await response.json()).toEqual({ ok: true, reference: "app-123" });
  });
});

describe("upstream failures and deadlines", () => {
  for (const [upstreamStatus, expectedStatus] of [[400, 400], [409, 409], [429, 429], [401, 502], [500, 502]]) {
    test("sanitises upstream status " + upstreamStatus, async () => {
      const response = await handleFranchiseRequest(post(), {
        apiUrl: API_URL,
        fetchImpl: async () => Response.json({ error: "OMNIQORA_PRIVATE_TOKEN postgres database detail" }, { status: upstreamStatus }),
      });
      expect(response.status).toBe(expectedStatus);
      const text = await response.text();
      expect(text).not.toContain("OMNIQORA");
      expect(text).not.toContain("postgres");
    });
  }

  for (const contentType of ["text/html", "application/json"]) {
    test("rejects a 200 invalid response of type " + contentType, async () => {
      const response = await handleFranchiseRequest(post(), {
        apiUrl: API_URL,
        fetchImpl: async () => new Response("<html>Not a receipt</html>", { headers: { "Content-Type": contentType } }),
      });
      expect(response.status).toBe(502);
      expect((await response.json()).ok).toBe(false);
    });
  }

  test("a fetch error never exposes an endpoint or secret", async () => {
    const response = await handleFranchiseRequest(post(), {
      apiUrl: API_URL,
      fetchImpl: async () => { throw new Error("https://service.invalid/?key=private-secret"); },
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-secret");
  });

  test("times out even when a failing fetch ignores AbortSignal", async () => {
    let signal: AbortSignal | null | undefined;
    const response = await handleFranchiseRequest(post(), {
      apiUrl: API_URL,
      timeoutMs: 10,
      fetchImpl: async (_url, init) => {
        signal = init.signal;
        return new Promise<Response>(() => {});
      },
    });
    expect(response.status).toBe(504);
    expect(signal?.aborted).toBe(true);
    expect((await response.json()).ok).toBe(false);
  });

  test("times out while reading an upstream response and cancels its stream", async () => {
    let cancelled = false;
    const response = await handleFranchiseRequest(post(), {
      apiUrl: API_URL,
      timeoutMs: 10,
      fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('{"ok":')); },
        cancel() { cancelled = true; },
      }), { headers: { "Content-Type": "application/json" } }),
    });
    expect(response.status).toBe(504);
    expect(cancelled).toBe(true);
  });

  test("bounds the size of an upstream JSON response", async () => {
    const response = await handleFranchiseRequest(post(), {
      apiUrl: API_URL,
      fetchImpl: async () => Response.json({ ok: true, padding: "a".repeat(300_000) }),
    });
    expect(response.status).toBe(502);
  });
});
