import { describe, expect, test } from "bun:test";
import {
  accountAfterAuthPath,
  accountSignInRequested,
  hasAccountAuthCallback,
  showPublicGuestAccount,
} from "../src/lib/mealdeck-account-entry";
import { customerEntryPolicy } from "../src/lib/mealdeck-customer-entry";

const signedOutVisitor = {
  registrationDeferred: true,
  signInRequested: false,
  authCallback: false,
  signedIn: false,
  emailPending: false,
};

describe("account opening-weekend presentation", () => {
  test("ordinary visitors use the guest view until the server's Monday boundary", () => {
    expect(showPublicGuestAccount(signedOutVisitor)).toBe(true);
    for (const [at, guest] of [
      ["2026-11-06T16:00:00Z", true],
      ["2026-11-08T23:59:59.999Z", true],
      ["2026-11-09T00:00:00Z", true],
      ["2026-11-09T12:59:59.999Z", true],
      ["2026-11-09T13:00:00Z", false],
    ] as const) {
      const policy = customerEntryPolicy(new Date(at));
      expect(
        showPublicGuestAccount({
          ...signedOutVisitor,
          registrationDeferred: policy.emailRegistrationDeferred,
        }),
      ).toBe(guest);
    }
  });

  test("explicit sign-in, callback recovery, pending verification and sessions retain their account flow", () => {
    for (const flow of [
      { signInRequested: true },
      { authCallback: true },
      { emailPending: true },
      { signedIn: true },
    ]) {
      expect(showPublicGuestAccount({ ...signedOutVisitor, ...flow })).toBe(false);
    }
  });

  test("the sign-in presentation flag accepts only the deliberate value 1", () => {
    expect(accountSignInRequested("1")).toBe(true);
    expect(accountSignInRequested(1)).toBe(true);
    for (const value of [
      undefined,
      null,
      false,
      true,
      "true",
      "0",
      0,
      "01",
      ["1"],
      { signin: 1 },
    ]) {
      expect(accountSignInRequested(value)).toBe(false);
    }
  });

  test("recognises auth callbacks before the browser client consumes their URL parameters", () => {
    for (const [search, hash] of [
      ["?code=one-time-code&returnTo=%2Fcheckout", ""],
      ["", "#access_token=example&refresh_token=example&type=magiclink"],
      ["?type=recovery", ""],
      ["?token_hash=example&type=signup", ""],
      ["?error=access_denied", ""],
      ["", "#error_code=otp_expired&error_description=Expired"],
    ]) {
      expect(hasAccountAuthCallback(search!, hash!)).toBe(true);
    }
    for (const [search, hash] of [
      ["", ""],
      ["?signin=1", ""],
      ["?returnTo=%2Fcheckout%3Fcode%3Dexample", ""],
      ["?code=&error=", ""],
      ["?type=collection", "#menus"],
    ]) {
      expect(hasAccountAuthCallback(search!, hash!)).toBe(false);
    }
  });

  test("callback cleanup keeps recovery accessible and only preserves allowlisted checkout destinations", () => {
    for (const target of [
      "/menus",
      "/checkout",
      "/checkout?group=1",
      "/group-order",
      "/group-pay",
    ]) {
      const clean = new URL(accountAfterAuthPath(target), "https://mealdeck.co.uk");
      expect(clean.origin).toBe("https://mealdeck.co.uk");
      expect(clean.pathname).toBe("/account");
      expect(clean.searchParams.get("signin")).toBe("1");
      expect(clean.searchParams.get("returnTo")).toBe(target === "/menus" ? null : target);
      expect([...clean.searchParams.keys()]).toEqual(
        target === "/menus" ? ["signin"] : ["signin", "returnTo"],
      );
    }
    for (const target of [
      "https://example.org/checkout",
      "//example.org",
      "/checkout?access_token=secret",
      "/group-order#token=secret",
      "javascript:alert(1)",
      null,
      undefined,
    ]) {
      expect(accountAfterAuthPath(target)).toBe("/account?signin=1");
    }
  });
});
