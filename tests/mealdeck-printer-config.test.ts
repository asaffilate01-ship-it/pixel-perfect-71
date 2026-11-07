import { describe, expect, test } from "bun:test";
import {
  handlePrinterConfigRequest,
  MEALDECK_PRINTER_BACKEND,
} from "../src/lib/mealdeck-printer-config.server";

const publicKey = "sb_publishable_fixture_key_12345678901234567890";
const request = () => new Request("https://mealdeck.co.uk/api/printer/config");
const ready = {
  MEALDECK_SUPABASE_URL: MEALDECK_PRINTER_BACKEND,
  MEALDECK_SUPABASE_PUBLISHABLE_KEY: publicKey,
};

describe("native printer public bootstrap", () => {
  test("returns only the validated public connection, never other environment values", async () => {
    const response = handlePrinterConfigRequest(request(), {
      ...ready,
      MEALDECK_CHECKOUT_SERVER_KEY: "must-not-leave-server",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-leave-server-either",
      STRIPE_SECRET_KEY: "must-not-be-exposed",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      status: "ready",
      backend: { url: MEALDECK_PRINTER_BACKEND, publishableKey: publicKey },
    });
  });

  test("refuses another project, privileged keys, missing settings and conflicting legacy settings", async () => {
    for (const env of [
      {},
      { ...ready, MEALDECK_SUPABASE_URL: "https://another-project.supabase.co" },
      { ...ready, MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture_12345678901234567890" },
      { ...ready, DISHBEE_SUPABASE_URL: "https://another-project.supabase.co" },
    ]) {
      const response = handlePrinterConfigRequest(request(), env);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        schemaVersion: 1,
        status: "unavailable",
        message: "The MealDeck printer connection is unavailable. Please try again later.",
      });
    }
  });

  test("does not accept configuration writes or a client-selected backend", async () => {
    const response = handlePrinterConfigRequest(
      new Request("https://mealdeck.co.uk/api/printer/config", { method: "POST", body: "{}" }),
      ready,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });
});
