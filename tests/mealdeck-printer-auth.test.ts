import { describe, expect, test } from "bun:test";
import { PrinterSignInError, signInPrinterWithPassword } from "../src/lib/mealdeck-printer-auth";

const user = { id: "verified-printer", email_confirmed_at: "2026-11-06T10:00:00Z" };

describe("printer password sign-in boundary", () => {
  test("uses the existing account, trims only the email and returns no session credential", async () => {
    const requests: unknown[] = [];
    const result = await signInPrinterWithPassword(
      {
        signInWithPassword: async (credentials) => {
          requests.push(credentials);
          return { data: { user, session: { access_token: "private-test-token" } }, error: null };
        },
      },
      " printer@example.test ",
      " password with spaces ",
    );
    expect(requests).toEqual([
      { email: "printer@example.test", password: " password with spaces " },
    ]);
    expect(result).toEqual({ id: user.id });
  });

  test("an unverified account receives an actionable verification instruction", async () => {
    const reason = await signInPrinterWithPassword(
      {
        signInWithPassword: async () => ({
          data: { user: null, session: null },
          error: { code: "email_not_confirmed", status: 400 },
        }),
      },
      "printer@example.test",
      "password",
    ).catch((error: unknown) => error);
    expect(reason).toBeInstanceOf(PrinterSignInError);
    expect((reason as Error).message).toContain("Verify this account’s email");
    expect((reason as Error).message).toContain("secure sign-in link");
  });

  test("a partial or unverified Auth result cannot establish printer sign-in", async () => {
    for (const data of [
      { user: null, session: {} },
      { user, session: null },
      { user: { id: user.id, email_confirmed_at: null }, session: {} },
    ]) {
      await expect(
        signInPrinterWithPassword(
          { signInWithPassword: async () => ({ data, error: null }) },
          "printer@example.test",
          "password",
        ),
      ).rejects.toBeInstanceOf(PrinterSignInError);
    }
  });

  test("rate limiting advises waiting while arbitrary provider failures remain generic", async () => {
    for (const error of [
      { code: "over_request_rate_limit", status: 400 },
      { code: "provider_private_detail", status: 429 },
    ]) {
      await expect(
        signInPrinterWithPassword(
          { signInWithPassword: async () => ({ data: { user: null, session: null }, error }) },
          "printer@example.test",
          "password",
        ),
      ).rejects.toThrow("Wait a minute");
    }
    const reason = await signInPrinterWithPassword(
      {
        signInWithPassword: async () => ({
          data: { user: null, session: null },
          error: { code: "unknown_private_provider_error", status: 500 },
        }),
      },
      "printer@example.test",
      "password",
    ).catch((error: unknown) => error);
    expect((reason as Error).message).toContain("Sign-in was not confirmed");
    expect((reason as Error).message).not.toContain("unknown_private_provider_error");
  });
});
