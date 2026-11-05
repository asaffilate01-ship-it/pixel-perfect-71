import { BridgeError } from "./journal.mjs";

// The receipt consumer is deliberately pinned to MealDeck's independent
// project. A browser cannot choose a host, table, RPC or service credential.
export const MEALDECK_SUPABASE_ORIGIN = "https://srsxybepwujuawyutnbs.supabase.co";
const MAX_RESPONSE_BYTES = 131072;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function jwtPayload(token) {
  if (
    typeof token !== "string" ||
    token.length > 8192 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  )
    return null;
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function validateBackend(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== 2 ||
    input.projectUrl !== MEALDECK_SUPABASE_ORIGIN ||
    typeof input.publishableKey !== "string"
  )
    throw new BridgeError("invalid_mealdeck_backend_configuration", 503);
  const key = input.publishableKey;
  const legacy = jwtPayload(key);
  const safeKey =
    /^sb_publishable_[A-Za-z0-9_-]{20,256}$/.test(key) ||
    (legacy?.role === "anon" && legacy?.ref === "srsxybepwujuawyutnbs");
  if (!safeKey) throw new BridgeError("publishable_or_mealdeck_anon_key_required", 503);
  return Object.freeze({ projectUrl: MEALDECK_SUPABASE_ORIGIN, publishableKey: key });
}

async function boundedJson(response) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? ""))
    throw new BridgeError("canonical_receipt_response_invalid", 503);
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
    throw new BridgeError("canonical_receipt_response_too_large", 503);
  const reader = response.body?.getReader();
  if (!reader) throw new BridgeError("canonical_receipt_response_invalid", 503);
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new BridgeError("canonical_receipt_response_too_large", 503);
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  try {
    return JSON.parse(Buffer.concat(parts, size).toString("utf8"));
  } catch {
    throw new BridgeError("canonical_receipt_response_invalid", 503);
  }
}

/** Verify each new claimed job with the fixed backend using this request's
 * short-lived staff JWT. The JWT and returned receipt are never written to the
 * local journal or logs. No refresh token is accepted or retained. */
export function createClaimedReceiptFetcher(input, { fetchImpl = fetch } = {}) {
  const backend = validateBackend(input);
  return async ({ jobId, claimToken, accessToken }) => {
    const payload = jwtPayload(accessToken);
    if (
      !uuid.test(jobId) ||
      !uuid.test(claimToken) ||
      !payload ||
      payload.role !== "authenticated" ||
      !uuid.test(payload.sub) ||
      payload.iss !== backend.projectUrl + "/auth/v1" ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Date.now() / 1000 ||
      !(
        payload.aud === "authenticated" ||
        (Array.isArray(payload.aud) && payload.aud.includes("authenticated"))
      )
    )
      throw new BridgeError("valid_staff_access_token_required", 401);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(
        backend.projectUrl + "/rest/v1/rpc/mealdeck_printer_claim_receipt",
        {
          method: "POST",
          redirect: "error",
          credentials: "omit",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            apikey: backend.publishableKey,
            Authorization: "Bearer " + accessToken,
          },
          body: JSON.stringify({ p_job: jobId, p_claim: claimToken }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new BridgeError(
          [400, 401, 403, 404, 409].includes(response.status)
            ? "receipt_claim_not_authorised"
            : "receipt_backend_unavailable",
          [400, 401, 403, 404, 409].includes(response.status) ? 403 : 503,
        );
      }
      const canonical = await boundedJson(response);
      if (
        !canonical ||
        typeof canonical !== "object" ||
        Array.isArray(canonical) ||
        Object.keys(canonical).length !== 2 ||
        canonical.jobId !== jobId ||
        !Object.hasOwn(canonical, "receipt")
      )
        throw new BridgeError("canonical_receipt_response_invalid", 503);
      return canonical.receipt;
    } catch (error) {
      // Never relay provider bodies/errors: they can include request headers.
      if (error instanceof BridgeError) throw error;
      throw new BridgeError("receipt_backend_unavailable", 503);
    } finally {
      clearTimeout(timeout);
    }
  };
}
