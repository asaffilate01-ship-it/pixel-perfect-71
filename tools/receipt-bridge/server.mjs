#!/usr/bin/env node
import { createServer } from "node:https";
import { readFile, lstat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { Journal, BridgeError } from "./journal.mjs";
import { ReceiptBridge } from "./service.mjs";
import { createTcpWriter, validatePrinter } from "./transport.mjs";
import { createBridgeRequestHandler } from "./http.mjs";
import { createClaimedReceiptFetcher, validateBackend } from "./backend.mjs";

export function validateConfiguration(input, baseDirectory = process.cwd()) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== 7 ||
    ![
      "schemaVersion",
      "serviceOrigin",
      "allowedOrigins",
      "stateDirectory",
      "tls",
      "printer",
      "backend",
    ].every((key) => Object.hasOwn(input, key)) ||
    input.schemaVersion !== 1
  )
    throw new BridgeError("invalid_bridge_configuration", 503);
  let origin;
  try {
    origin = new URL(input.serviceOrigin);
  } catch {
    throw new BridgeError("invalid_local_https_origin", 503);
  }
  if (input.serviceOrigin !== "https://127.0.0.1:17443")
    throw new BridgeError("invalid_local_https_origin", 503);
  if (
    !Array.isArray(input.allowedOrigins) ||
    !input.allowedOrigins.length ||
    input.allowedOrigins.length > 4 ||
    new Set(input.allowedOrigins).size !== input.allowedOrigins.length
  )
    throw new BridgeError("invalid_trusted_origins", 503);
  for (const allowed of input.allowedOrigins) {
    let url;
    try {
      url = new URL(allowed);
    } catch {
      throw new BridgeError("invalid_trusted_origins", 503);
    }
    if (
      url.protocol !== "https:" ||
      allowed !== url.origin ||
      url.username ||
      url.password ||
      url.hostname === "null" ||
      url.hostname.includes("*")
    )
      throw new BridgeError("invalid_trusted_origins", 503);
  }
  const file = (value) => {
    if (typeof value !== "string" || !value || value.includes("\0"))
      throw new BridgeError("invalid_local_path", 503);
    return isAbsolute(value) ? value : resolve(baseDirectory, value);
  };
  if (
    !input.tls ||
    typeof input.tls !== "object" ||
    Object.keys(input.tls).length !== 2 ||
    !Object.hasOwn(input.tls, "keyFile") ||
    !Object.hasOwn(input.tls, "certFile")
  )
    throw new BridgeError("local_tls_certificate_required", 503);
  return {
    serviceOrigin: origin.origin,
    host: origin.hostname,
    port: Number(origin.port),
    allowedOrigins: [...input.allowedOrigins],
    stateDirectory: file(input.stateDirectory),
    tls: { keyFile: file(input.tls.keyFile), certFile: file(input.tls.certFile) },
    printer: validatePrinter(input.printer),
    backend: validateBackend(input.backend),
  };
}

export async function startBridge(configuration, { pair = false, revokePairs = false } = {}) {
  const keyStat = await lstat(configuration.tls.keyFile);
  if (!keyStat.isFile() || keyStat.isSymbolicLink() || (keyStat.mode & 0o077) !== 0)
    throw new BridgeError("tls_private_key_must_be_private", 503);
  const [key, cert] = await Promise.all([
    readFile(configuration.tls.keyFile),
    readFile(configuration.tls.certFile),
  ]);
  const journal = await Journal.open(configuration.stateDirectory);
  try {
    if (revokePairs) await journal.revokePairs();
    const profile = {
      columns: configuration.printer.columns,
      cut: configuration.printer.cut,
      feedLines: configuration.printer.feedLines,
    };
    const bridge = new ReceiptBridge({
      journal,
      writer: createTcpWriter(configuration.printer),
      profile,
      allowedOrigins: configuration.allowedOrigins,
      fetchClaimedReceipt: createClaimedReceiptFetcher(configuration.backend),
    });
    const server = createServer(
      { key, cert, minVersion: "TLSv1.2" },
      createBridgeRequestHandler(bridge, { serviceOrigin: configuration.serviceOrigin }),
    );
    server.headersTimeout = 5000;
    server.requestTimeout = 10000;
    server.keepAliveTimeout = 2000;
    server.maxHeadersCount = 30;
    server.maxConnections = 8;
    server.on("clientError", (_error, socket) =>
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"),
    );
    await new Promise((resolveListening, reject) => {
      server.once("error", reject);
      server.listen(configuration.port, configuration.host, resolveListening);
    });
    let closing;
    const close = () =>
      (closing ??= (async () => {
        await new Promise((done) => {
          server.close(done);
          server.closeIdleConnections();
        });
        // Existing requests have completed; a shutdown does not interrupt a write
        // and then restart it. An abrupt exit is recovered as a held journal job.
        await journal.close();
      })());
    return { server, bridge, journal, close, pairingCode: pair ? bridge.openPairing() : null };
  } catch (error) {
    await journal.close();
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write(
      "Usage: node tools/receipt-bridge/server.mjs --config /absolute/bridge.json [--pair] [--revoke-pairs]\nHTTPS and a fixed private TCP ESC/POS printer are required. See tools/receipt-bridge/README.md.\n",
    );
    return;
  }
  const index = args.indexOf("--config");
  if (
    index < 0 ||
    !args[index + 1] ||
    args
      .filter((value, i) => i !== index && i !== index + 1)
      .some((value) => !["--pair", "--revoke-pairs"].includes(value)) ||
    args.filter((value) => value === "--config").length !== 1
  )
    throw new BridgeError("use_config_argument_and_read_help", 503);
  const path = resolve(args[index + 1]);
  const configuration = validateConfiguration(
    JSON.parse(await readFile(path, "utf8")),
    dirname(path),
  );
  const runtime = await startBridge(configuration, {
    pair: args.includes("--pair"),
    revokePairs: args.includes("--revoke-pairs"),
  });
  process.stdout.write(
    JSON.stringify({
      event: "bridge_listening",
      origin: configuration.serviceOrigin,
      bridgeId: runtime.journal.bridgeId,
      transport: "tcp-escpos",
    }) + "\n",
  );
  if (runtime.pairingCode)
    process.stdout.write(
      "LOCAL PAIRING CODE (one use, expires in 5 minutes): " + runtime.pairingCode + "\n",
    );
  if (process.stdin.isTTY) {
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    process.stdout.write(
      "Local commands: pair (new code), revoke-pairs (disconnect all paired sessions).\n",
    );
    terminal.on("line", (line) => {
      if (line.trim() === "pair")
        process.stdout.write(
          "LOCAL PAIRING CODE (one use, expires in 5 minutes): " +
            runtime.bridge.openPairing() +
            "\n",
        );
      else if (line.trim() === "revoke-pairs")
        void runtime.journal.revokePairs().then(
          () => process.stdout.write("All paired sessions revoked. Type pair to connect again.\n"),
          () =>
            process.stderr.write(
              "Pair revocation failed; stop the bridge and check the journal.\n",
            ),
        );
    });
  }
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      void runtime.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      JSON.stringify({
        error: error instanceof BridgeError ? error.code : "bridge_start_failed",
        message:
          "Check the local configuration, private file permissions and documented recovery steps.",
      }) + "\n",
    );
    process.exitCode = 1;
  });
}
