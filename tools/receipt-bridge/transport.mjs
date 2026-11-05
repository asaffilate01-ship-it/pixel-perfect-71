import net from "node:net";
import { BridgeError } from "./journal.mjs";

export function privateIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function validatePrinter(printer) {
  if (
    !printer ||
    typeof printer !== "object" ||
    Array.isArray(printer) ||
    Object.keys(printer).some(
      (key) => !["host", "port", "timeoutMs", "columns", "cut", "feedLines"].includes(key),
    ) ||
    !privateIPv4(printer.host) ||
    !Number.isInteger(printer.port) ||
    printer.port < 1 ||
    printer.port > 65535
  )
    throw new BridgeError("invalid_fixed_printer_configuration", 503);
  const timeoutMs = printer.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 15000)
    throw new BridgeError("invalid_printer_timeout", 503);
  const profile = {
    columns: printer.columns ?? 42,
    cut: printer.cut ?? "none",
    feedLines: printer.feedLines ?? 3,
  };
  if (
    ![32, 42, 48].includes(profile.columns) ||
    !["none", "partial", "full"].includes(profile.cut) ||
    !Number.isInteger(profile.feedLines) ||
    profile.feedLines < 0 ||
    profile.feedLines > 5
  )
    throw new BridgeError("invalid_printer_profile", 503);
  return Object.freeze({ host: printer.host, port: printer.port, timeoutMs, ...profile });
}

export class TransportError extends Error {
  constructor(attempted) {
    super(attempted ? "printer_send_uncertain" : "printer_connection_failed");
    this.code = this.message;
    this.attempted = attempted;
  }
}

/** One connection, one bounded write, no transport retry or printer commands from HTTP. */
export function createTcpWriter(input) {
  const printer = validatePrinter(input);
  return async (bytes, beforeWrite) => {
    const socket = new net.Socket();
    let attempted = false;
    let failure = null;
    let failCurrent = () => {};
    const fail = () => {
      failure ??= new TransportError(attempted);
      failCurrent(failure);
      socket.destroy();
    };
    socket.on("error", fail);
    socket.on("close", () => {
      if (!socket.writableFinished) fail();
    });
    const timeout = setTimeout(fail, printer.timeoutMs);
    try {
      await new Promise((resolve, reject) => {
        failCurrent = reject;
        socket.once("connect", resolve);
        socket.connect(printer.port, printer.host);
      });
      await beforeWrite();
      if (failure || socket.destroyed) throw failure ?? new TransportError(false);
      await new Promise((resolve, reject) => {
        failCurrent = reject;
        attempted = true;
        socket.end(Buffer.from(bytes), (error) =>
          error ? reject(new TransportError(true)) : resolve(),
        );
      });
      // The OS accepted this one write. This is not a physical-paper assertion.
      return { status: "sent_unconfirmed" };
    } catch (error) {
      if (error instanceof TransportError) throw error;
      if (attempted) throw new TransportError(true);
      throw error;
    } finally {
      clearTimeout(timeout);
      socket.destroy();
    }
  };
}
