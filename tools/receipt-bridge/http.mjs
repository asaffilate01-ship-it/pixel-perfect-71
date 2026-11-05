import { BridgeError } from "./journal.mjs";
import { ReceiptError } from "./receipt.mjs";

export const MAX_HTTP_BODY_BYTES = 131072;
function json(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}
function body(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] ?? ""))
    throw new BridgeError("json_content_type_required", 415);
  const length = req.headers["content-length"];
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_HTTP_BODY_BYTES))
    throw new BridgeError("request_too_large", 413);
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    let exceeded = false;
    req.on("data", (part) => {
      size += part.length;
      if (size > MAX_HTTP_BODY_BYTES) {
        if (!exceeded) reject(new BridgeError("request_too_large", 413));
        exceeded = true;
        parts.length = 0;
      } else if (!exceeded) parts.push(part);
    });
    req.on("end", () => {
      if (exceeded) return;
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString("utf8")));
      } catch {
        reject(new BridgeError("invalid_json"));
      }
    });
    req.on("aborted", () => reject(new BridgeError("request_aborted")));
    req.on("error", () => reject(new BridgeError("request_error")));
  });
}

/** The production server supplies an exact HTTPS origin; HTTP is only a test harness. */
export function createBridgeRequestHandler(bridge, { serviceOrigin }) {
  const expectedHost = new URL(serviceOrigin).host;
  return async (req, res) => {
    let cors = {};
    try {
      if (req.headers.host !== expectedHost) throw new BridgeError("host_not_allowed", 403);
      const origin = req.headers.origin;
      if (typeof origin !== "string" || !bridge.allowedOrigins.has(origin))
        throw new BridgeError("origin_not_allowed", 403);
      cors = {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin, Access-Control-Request-Headers",
      };
      if (req.method === "OPTIONS") {
        const requestedMethod = req.headers["access-control-request-method"];
        const headers = (req.headers["access-control-request-headers"] ?? "")
          .toLowerCase()
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        if (
          !["GET", "POST"].includes(requestedMethod) ||
          headers.some(
            (value) =>
              !["authorization", "content-type", "x-mealdeck-access-token"].includes(value),
          )
        )
          throw new BridgeError("preflight_not_allowed", 403);
        res.writeHead(204, {
          ...cors,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Mealdeck-Access-Token",
          "Access-Control-Max-Age": "60",
          ...(req.headers["access-control-request-private-network"] === "true"
            ? { "Access-Control-Allow-Private-Network": "true" }
            : {}),
        });
        res.end();
        return;
      }
      if (typeof req.url !== "string" || !req.url.startsWith("/"))
        throw new BridgeError("invalid_path", 404);
      const url = new URL(req.url, serviceOrigin);
      if (url.origin !== serviceOrigin || url.search || url.hash)
        throw new BridgeError("invalid_path", 404);
      if (url.pathname === "/v1/health" && req.method === "GET") {
        json(res, 200, { status: "ready", schemaVersion: 1, requiresPairing: true }, cors);
        return;
      }
      if (url.pathname === "/v1/pair" && req.method === "POST") {
        const input = await body(req);
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).length !== 1 ||
          !Object.hasOwn(input, "code")
        )
          throw new BridgeError("invalid_pair_request");
        json(res, 200, await bridge.pair(origin, input.code), cors);
        return;
      }
      const pairId = bridge.authorize(origin, req.headers.authorization);
      if (url.pathname === "/v1/recovery" && req.method === "GET") {
        json(res, 200, bridge.recovery(), cors);
        return;
      }
      if (url.pathname === "/v1/status" && req.method === "GET") {
        json(
          res,
          200,
          {
            bridgeId: bridge.journal.bridgeId,
            busy: bridge.current !== null,
            requiresRecovery: bridge.journal.all().some((job) => job.status === "held"),
            transport: "tcp-escpos",
            profile: bridge.profile,
          },
          cors,
        );
        return;
      }
      if (url.pathname === "/v1/jobs" && req.method === "POST") {
        const result = await bridge.submit(
          await body(req),
          pairId,
          req.headers["x-mealdeck-access-token"],
        );
        json(res, result.replayed ? 200 : 201, result, cors);
        return;
      }
      const match = /^\/v1\/jobs\/([0-9a-f-]{36})(\/resolve)?$/i.exec(url.pathname);
      if (match && req.method === "GET" && !match[2]) {
        json(res, 200, bridge.get(match[1]), cors);
        return;
      }
      if (match && req.method === "POST" && match[2]) {
        json(res, 200, await bridge.resolve(match[1], await body(req), pairId), cors);
        return;
      }
      throw new BridgeError("route_not_found", 404);
    } catch (error) {
      if (res.headersSent) return;
      const recognized = error instanceof BridgeError || error instanceof ReceiptError;
      json(
        res,
        error instanceof BridgeError ? error.status : recognized ? 400 : 503,
        { error: recognized ? error.code : "bridge_unavailable" },
        cors,
      );
    }
  };
}
