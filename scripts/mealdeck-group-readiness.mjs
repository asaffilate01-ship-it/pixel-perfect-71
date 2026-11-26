/**
 * Read-only production preflight for new MealDeck group rooms.
 * This never POSTs, creates rooms, accesses personal data or makes payments.
 * Run explicitly: node scripts/mealdeck-group-readiness.mjs --live
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const GROUP_READINESS_ENDPOINT = "https://mealdeck.co.uk/api/group-orders";

export async function probeGroupReadiness(fetcher = fetch) {
  const response = await fetcher(GROUP_READINESS_ENDPOINT, {
    method: "GET",
    redirect: "manual",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    return { ready: false, code: "http_unavailable", httpStatus: response.status };
  }
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    return { ready: false, code: "invalid_content_type", httpStatus: response.status };
  }

  // Cookie *presence and attributes* only; never log or retain the actor token.
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") || "").split(/,(?=\s*[^;,=\s]+=)/);
  const actorCookie = cookies.find((value) =>
    /^__Host-mealdeck-room-actor=[A-Za-z0-9_-]{43}(?:;|$)/.test(value.trim()),
  ) || "";
  const secureCookie = actorCookie.length > 0 &&
    /(?:^|;)\s*HttpOnly(?:;|$)/i.test(actorCookie) &&
    /(?:^|;)\s*Secure(?:;|$)/i.test(actorCookie) &&
    /(?:^|;)\s*SameSite=Lax(?:;|$)/i.test(actorCookie) &&
    /(?:^|;)\s*Path=\/(?:;|$)/i.test(actorCookie);

  let body;
  try {
    body = await response.json();
  } catch {
    return { ready: false, code: "invalid_json", httpStatus: response.status };
  }
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    typeof body.available !== "boolean" ||
    body.joinWindowSeconds !== 180 || body.maxPeople !== 10
  ) {
    return { ready: false, code: "unexpected_contract", httpStatus: response.status };
  }
  if (body.available !== true || body.newRoomsAvailable !== true) {
    return {
      ready: false,
      code: "new_rooms_paused",
      httpStatus: response.status,
      newRoomsAvailable: false,
    };
  }
  if (!secureCookie) {
    return { ready: false, code: "room_cookie_missing_or_insecure", httpStatus: response.status };
  }
  return { ready: true, code: "new_rooms_advertised", httpStatus: response.status };
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  if (!process.argv.includes("--live")) {
    process.stdout.write("Read-only probe: pass --live to check production group-room admission. No room or payment is created.\n");
  } else {
    try {
      const result = await probeGroupReadiness();
      process.stdout.write(JSON.stringify(result) + "\n");
      // Passing means GET admits rooms. It does NOT prove a real Stripe payment or KDS handoff.
      if (!result.ready) process.exitCode = 2;
    } catch {
      // No underlying error details or credentials are written to CI logs.
      process.stderr.write("Group-room readiness could not be verified.\n");
      process.exitCode = 1;
    }
  }
}
