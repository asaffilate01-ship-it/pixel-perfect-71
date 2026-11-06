import { customerReturnTarget } from "./mealdeck-customer-return";

/** A presentation choice only. Authentication and checkout permissions stay server-owned. */
export function accountSignInRequested(value: unknown): boolean {
  return value === "1" || value === 1;
}

/** Remember callback intent before the Auth client consumes or removes its URL parameters. */
export function hasAccountAuthCallback(search: string, hash: string): boolean {
  const callbackKeys = [
    "code",
    "error",
    "error_code",
    "error_description",
    "access_token",
    "refresh_token",
    "token_hash",
  ];
  const callbackTypes = new Set(["recovery", "signup", "magiclink", "invite", "email_change"]);
  return [new URLSearchParams(search), new URLSearchParams(hash.replace(/^#/, ""))].some(
    (params) =>
      callbackKeys.some((key) => !!params.get(key)) || callbackTypes.has(params.get("type") ?? ""),
  );
}

export function showPublicGuestAccount(input: {
  registrationDeferred: boolean;
  signInRequested: boolean;
  authCallback: boolean;
  signedIn: boolean;
  emailPending: boolean;
}): boolean {
  return (
    input.registrationDeferred &&
    !input.signInRequested &&
    !input.authCallback &&
    !input.signedIn &&
    !input.emailPending
  );
}

/** Drop callback credentials and arbitrary redirects while keeping sign-in recovery accessible. */
export function accountAfterAuthPath(returnTo: unknown): string {
  const target = customerReturnTarget(returnTo);
  return (
    "/account?signin=1" + (target === "/menus" ? "" : `&returnTo=${encodeURIComponent(target)}`)
  );
}
