/**
 * Read-only release smoke test against the canonical public MealDeck endpoint.
 * Never posts, creates a room, accepts an invitation or starts a payment.
 * Intentionally prints no cookies, tokens, response body or customer details.
 */
const url = new URL("https://mealdeck.co.uk/api/group-orders");
const expectedOrigin = "https://mealdeck.co.uk";
if (url.origin !== expectedOrigin || url.pathname !== "/api/group-orders")
  throw new Error("Unexpected group-readiness target");

let response;
try {
  response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  console.error("Group readiness check could not reach the public endpoint:", error instanceof Error ? error.name : "network_failure");
  process.exitCode = 1;
  process.exit();
}
const summary = {
  httpStatus: response.status,
  contentTypeJson: (response.headers.get("content-type") ?? "").toLowerCase().includes("application/json"),
  cachePrivate: (response.headers.get("cache-control") ?? "").toLowerCase().includes("no-store"),
  roomsAvailable: false,
  newRoomsAvailable: false,
  invitationWindowSeconds: null,
  maximumPeople: null,
};
let status;
try {
  if (!summary.contentTypeJson || Number(response.headers.get("content-length") ?? 0) > 20_000)
    throw new Error("bad_content_type");
  const body = await response.text();
  if (body.length > 20_000) throw new Error("response_too_large");
  status = JSON.parse(body);
  if (!status || typeof status !== "object" || Array.isArray(status))
    throw new Error("malformed_status");
  summary.roomsAvailable = status.available === true;
  summary.newRoomsAvailable = status.newRoomsAvailable === true;
  summary.invitationWindowSeconds = status.joinWindowSeconds === 180 ? 180 : null;
  summary.maximumPeople = status.maxPeople === 10 ? 10 : null;
} catch {
  console.error("Group readiness check returned a malformed/non-JSON status.");
  process.exitCode = 1;
}
const released = response.status === 200 && summary.contentTypeJson &&
  summary.cachePrivate && summary.roomsAvailable && summary.newRoomsAvailable &&
  summary.invitationWindowSeconds === 180 && summary.maximumPeople === 10;
console.log(JSON.stringify({ check: "mealdeck_public_group_readiness", ...summary, released }));
if (!released) {
  console.error("NOT LIVE VERIFIED: group-room admission is not confirmed on the canonical website.");
  process.exitCode = 1;
} else {
  console.log("GROUP ROOM ADMISSION READY. Real two-device invitation, payment and kitchen acceptance are still required.");
}
