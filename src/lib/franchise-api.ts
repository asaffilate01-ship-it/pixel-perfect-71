import { z } from "zod";
import {
  DEFAULT_PROGRAMME,
  OFFER_VERSION,
  normaliseTerritories,
} from "./franchise-offer";

const PROGRAMME_KEY = "mealdeck-england-wales";
const SOURCE = "mealdeck-franchise-page";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const UNAVAILABLE =
  "Franchise enquiries are temporarily unavailable. Please try again later.";
const UNCONFIRMED =
  "We could not confirm that your enquiry was received. Please contact the team before submitting again.";
const INVALID_DETAILS =
  "Please check your details and confirm the required acknowledgements.";
const STALE_OFFER =
  "The franchise offer has changed. Refresh this page, review the revised fees and confirm the required acknowledgements again.";
const TERRITORY_UNAVAILABLE =
  "That territory is not currently open for applications. Choose another area or send a general enquiry.";

function hasControls(value: string, multiline = false): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 127 || (code < 32 && !(multiline && [9, 10, 13].includes(code)))) {
      return true;
    }
  }
  return false;
}

const singleLine = (max: number, min = 0) =>
  z.string().trim().min(min).max(max).refine((value) => !hasControls(value));
const optionalText = (max: number) =>
  singleLine(max).nullish().transform((value) => value || null);

const enquirySchema = z.object({
  programmeKey: z.literal(PROGRAMME_KEY).default(PROGRAMME_KEY),
  territoryCode: singleLine(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    .nullish()
    .transform((value) => value ?? null),
  name: singleLine(120, 2),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: optionalText(40),
  preferredArea: singleLine(160, 2),
  existingKitchen: z.boolean().default(false),
  existingBusiness: optionalText(200),
  availableCapitalMinor: z.number().finite().int().min(0).max(1_000_000_000).nullish()
    .transform((value) => value ?? null),
  launchTiming: optionalText(80),
  multiUnitInterest: z.boolean().default(false),
  operatorModel: z.enum(["owner_operator", "multi_unit_operator"]).default("owner_operator"),
  source: z.literal(SOURCE).default(SOURCE),
  utm: z.object({
    utm_source: singleLine(200).optional(),
    utm_medium: singleLine(200).optional(),
    utm_campaign: singleLine(200).optional(),
    utm_content: singleLine(200).optional(),
    utm_term: singleLine(200).optional(),
  }).default({}),
  consent: z.literal(true),
  marketingConsent: z.literal(false).default(false),
  website: singleLine(200).default("").refine((value) => value === ""),
  answers: z.object({
    offerVersion: z.literal(OFFER_VERSION),
    operatingExperience: z.string().trim().max(2000)
      .refine((value) => !hasControls(value, true))
      .default(""),
    setupPackageAcknowledged: z.literal(true),
    operatorResponsibilitiesAcknowledged: z.literal(true),
    selectedTerritory: optionalText(160),
  }),
});

export type FranchiseEnquiry = z.infer<typeof enquirySchema>;
export type FranchiseFetch = (url: URL, init: RequestInit) => Promise<Response>;
export interface FranchiseApiOptions {
  /** Read only from the server environment in the route handler. */
  apiUrl?: string | undefined;
  fetchImpl?: FranchiseFetch | undefined;
  timeoutMs?: number | undefined;
  allowInsecureLocalhost?: boolean | undefined;
}

export function validateFranchiseEnquiry(input: unknown) {
  return enquirySchema.safeParse(input);
}

class PublicError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

class BodyTooLarge extends Error {}
class DeadlineExceeded extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function endpoint(apiUrl: string | undefined, allowLocal: boolean): URL {
  if (!apiUrl?.trim()) throw new PublicError(503, UNAVAILABLE);
  let url: URL;
  try {
    url = new URL(apiUrl.trim());
  } catch {
    throw new PublicError(503, UNAVAILABLE);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(allowLocal && local && url.protocol === "http:")) ||
    url.username || url.password || url.hash
  ) {
    throw new PublicError(503, UNAVAILABLE);
  }
  // No request-supplied URL, credential, filter, or query is forwarded.
  url.search = "";
  url.searchParams.set("programme", PROGRAMME_KEY);
  return url;
}

function checkGetQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some((key) => key !== "programme") ||
    params.getAll("programme").length > 1 ||
    (params.has("programme") && params.get("programme") !== PROGRAMME_KEY)
  ) {
    throw new PublicError(400, "Please use the MealDeck franchise enquiry page.");
  }
}

function checkPostHeaders(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    throw new PublicError(403, "Please submit your enquiry from the MealDeck website.");
  }
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new PublicError(415, "Please submit your enquiry using the form on this page.");
  }
}

async function limitedJson(
  message: Request | Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  const declaredLength = Number(message.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    // Release a fetch connection even if a response is rejected before reading.
    void message.body?.cancel().catch(() => undefined);
    throw new BodyTooLarge();
  }
  if (!message.body) throw new SyntaxError("Empty JSON body");
  const reader = message.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new DeadlineExceeded();
    while (true) {
      const part = await reader.read();
      if (signal.aborted) throw new DeadlineExceeded();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        cancel();
        throw new BodyTooLarge();
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new DeadlineExceeded());
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function hasFailure(payload: Record<string, unknown>) {
  return payload["ok"] === false || payload["success"] === false ||
    (payload["error"] !== undefined && payload["error"] !== null &&
      payload["error"] !== "" && payload["error"] !== false) ||
    (Array.isArray(payload["errors"]) && payload["errors"].length > 0) ||
    ["error", "failed", "failure", "rejected"].includes(String(payload["status"] ?? "").toLowerCase());
}

async function upstreamJson(
  target: URL,
  method: "GET" | "POST",
  options: FranchiseApiOptions,
  timeoutMs: number,
  enquiry?: FranchiseEnquiry,
): Promise<Record<string, unknown>> {
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  return withDeadline(async (signal) => {
    const headers: Record<string, string> = { Accept: "application/json", "Cache-Control": "no-cache" };
    const init: RequestInit = {
      method,
      headers,
      redirect: "error",
      cache: "no-store",
      signal,
    };
    if (enquiry) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(enquiry);
    }
    const response = await fetchImpl(target, init);
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      if (response.status === 429) {
        throw new PublicError(429, "Please wait a few minutes before submitting another enquiry.");
      }
      if (method === "POST" && response.status === 409) {
        throw new PublicError(409, TERRITORY_UNAVAILABLE);
      }
      if (method === "POST" && [400, 422].includes(response.status)) {
        throw new PublicError(400, INVALID_DETAILS);
      }
      throw new PublicError(502, method === "POST" ? UNCONFIRMED : UNAVAILABLE);
    }
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type !== "application/json" && !/^application\/[a-z0-9.+-]+\+json$/.test(type)) {
      void response.body?.cancel().catch(() => undefined);
      throw new PublicError(502, method === "POST" ? UNCONFIRMED : UNAVAILABLE);
    }
    let payload: unknown;
    try {
      payload = await limitedJson(response, MAX_RESPONSE_BYTES, signal);
    } catch (error) {
      if (error instanceof DeadlineExceeded || signal.aborted) throw new DeadlineExceeded();
      throw new PublicError(502, method === "POST" ? UNCONFIRMED : UNAVAILABLE);
    }
    if (!isRecord(payload) || hasFailure(payload)) {
      throw new PublicError(502, method === "POST" ? UNCONFIRMED : UNAVAILABLE);
    }
    return payload;
  }, timeoutMs);
}

async function currentTerritories(
  target: URL,
  options: FranchiseApiOptions,
  timeoutMs: number,
) {
  const payload = await upstreamJson(target, "GET", options, timeoutMs);
  const programme = payload["programme"];
  if (
    !isRecord(programme) || programme["key"] !== PROGRAMME_KEY ||
    !Array.isArray(payload["territories"])
  ) {
    throw new PublicError(502, UNAVAILABLE);
  }
  // Convert the verified upstream price basis exactly once, at the server edge.
  // The browser normaliser must never apply the entry-fee reduction again.
  return normaliseTerritories(adaptUpstreamFees(programme, payload["territories"]));
}

/** Never infer a fee's revision from its amount: old and new ranges overlap. */
function adaptUpstreamFees(programme: Record<string, unknown>, rows: unknown[]): unknown[] {
  const programmeVersion = programme["franchiseFeeVersion"];
  const knownLegacyProgramme =
    (programmeVersion === undefined || programmeVersion === "legacy") &&
    programme["feeMin"] === 7500 && programme["feeMax"] === 25000;

  return rows.slice(0, 500).map((row) => {
    if (!isRecord(row)) return row;
    const version = row["franchiseFeeVersion"];
    const rawFee = row["fee"];
    let fee: number | null = null;
    if (typeof rawFee === "number" && Number.isFinite(rawFee)) {
      if (version === OFFER_VERSION) {
        if (rawFee >= DEFAULT_PROGRAMME.feeMin && rawFee <= DEFAULT_PROGRAMME.feeMax) fee = rawFee;
      } else if (version === "legacy" || (version === undefined && knownLegacyProgramme)) {
        if (rawFee >= 7500 && rawFee <= 25000) {
          // Match the database migration: halve integer pence, then round to a penny.
          const previousFeeMinor = Math.round(rawFee * 100);
          fee = Math.round(previousFeeMinor / 2) / 100;
        }
      }
    }
    // A programme revision alone cannot certify that an individual row migrated.
    // Unknown, missing or contradictory price provenance leaves the fee unquoted.
    return { ...row, fee, franchiseFeeVersion: fee === null ? undefined : OFFER_VERSION };
  });
}

function receiptReference(payload: Record<string, unknown>): string | null {
  for (const key of ["applicationId", "id", "leadId"]) {
    const value = payload[key];
    if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)) {
      return value;
    }
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return String(value);
    }
  }
  return null;
}

/**
 * Public MealDeck adapter. Only the route supplies server configuration.
 * Never forwards cookies, authorization, caller headers, raw errors, or PII to logs.
 * An enquiry is not a territory hold; final allocation remains an approval step.
 */
export async function handleFranchiseRequest(
  request: Request,
  options: FranchiseApiOptions = {},
): Promise<Response> {
  const timeoutMs = typeof options.timeoutMs === "number" &&
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? Math.min(options.timeoutMs, 30_000)
    : DEFAULT_TIMEOUT_MS;
  const isPost = request.method === "POST";
  try {
    if (request.method !== "GET" && !isPost) {
      return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "GET, POST" });
    }
    if (!isPost) {
      checkGetQuery(request);
      const target = endpoint(options.apiUrl, options.allowInsecureLocalhost === true);
      const territories = await currentTerritories(target, options, timeoutMs);
      // The reviewed offer is authoritative; old fees and private programme fields
      // from the CRM are deliberately excluded from this public response.
      return json({ ok: true, programme: DEFAULT_PROGRAMME, territories });
    }

    checkPostHeaders(request);
    let input: unknown;
    try {
      input = await withDeadline(
        (signal) => limitedJson(request, MAX_REQUEST_BYTES, signal),
        timeoutMs,
      );
    } catch (error) {
      if (error instanceof DeadlineExceeded) {
        throw new PublicError(408, "The enquiry took too long to upload. Please try again.");
      }
      if (error instanceof BodyTooLarge) {
        throw new PublicError(413, "Your enquiry is too long. Please shorten the details and try again.");
      }
      throw new PublicError(400, INVALID_DETAILS);
    }
    const submittedAnswers = isRecord(input) ? input["answers"] : null;
    if (isRecord(submittedAnswers) && submittedAnswers["offerVersion"] === "2026-10-06") {
      throw new PublicError(409, STALE_OFFER);
    }
    const parsed = validateFranchiseEnquiry(input);
    if (!parsed.success) throw new PublicError(400, INVALID_DETAILS);
    const enquiry = {
      ...parsed.data,
      answers: {
        ...parsed.data.answers,
        // The upstream answers record accepts this server-authored offer snapshot.
        // Caller-supplied prices and snapshots are stripped by enquirySchema.
        offerSnapshot: DEFAULT_PROGRAMME,
        selectedTerritoryFee: null as number | null,
      },
    };
    const target = endpoint(options.apiUrl, options.allowInsecureLocalhost === true);

    // Always replace caller-supplied territory labels with the verified record.
    enquiry.answers.selectedTerritory = null;
    if (enquiry.territoryCode) {
      const territories = await currentTerritories(target, options, timeoutMs);
      const territory = territories.find((item) => item.code === enquiry.territoryCode);
      if (!territory || territory.status !== "available" || !territory.isSellable) {
        throw new PublicError(409, TERRITORY_UNAVAILABLE);
      }
      enquiry.answers.selectedTerritory = territory.name;
      enquiry.answers.selectedTerritoryFee = territory.fee;
    }
    enquiry.answers.offerVersion = OFFER_VERSION;
    enquiry.answers.setupPackageAcknowledged = true;
    enquiry.answers.operatorResponsibilitiesAcknowledged = true;
    const payload = await upstreamJson(target, "POST", options, timeoutMs, enquiry);
    const reference = receiptReference(payload);
    // The verified service returns a persisted applicationId. A bare ok/success
    // acknowledgement does not prove that the enquiry was saved.
    if (reference === null) throw new PublicError(502, UNCONFIRMED);
    return json({ ok: true, reference }, 201);
  } catch (error) {
    if (error instanceof PublicError) return json({ ok: false, error: error.message }, error.status);
    if (error instanceof DeadlineExceeded) {
      return json({
        ok: false,
        error: isPost ? UNCONFIRMED : "Live territory availability is taking too long. Please try again shortly.",
      }, 504);
    }
    return json({ ok: false, error: isPost ? UNCONFIRMED : UNAVAILABLE }, 503);
  }
}
