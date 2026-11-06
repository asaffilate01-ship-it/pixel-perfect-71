type PrinterPasswordAuth = {
  signInWithPassword: (credentials: { email: string; password: string }) => Promise<{
    data: {
      user: { id: string; email_confirmed_at?: string | null | undefined } | null;
      session: unknown;
    };
    error: { code?: string | undefined; status?: number | undefined } | null;
  }>;
};

export class PrinterSignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrinterSignInError";
  }
}

/** Auth establishes the account only. Every printer operation still needs the
 * server's current verified identity and kitchen-specific access checks. */
export async function signInPrinterWithPassword(
  auth: PrinterPasswordAuth,
  email: string,
  password: string,
): Promise<{ id: string }> {
  const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
  if (error?.code === "email_not_confirmed")
    throw new PrinterSignInError(
      "Verify this account’s email before signing in to the printer. You can request a secure sign-in link below.",
    );
  if (error?.status === 429 || error?.code === "over_request_rate_limit")
    throw new PrinterSignInError("Too many sign-in attempts. Wait a minute and try again.");
  if (error || !data.user || !data.session)
    throw new PrinterSignInError(
      "Sign-in was not confirmed. Check the email address and password, or request a secure sign-in link.",
    );
  if (!data.user.email_confirmed_at)
    throw new PrinterSignInError(
      "Verify this account’s email before signing in to the printer. You can request a secure sign-in link below.",
    );
  return { id: data.user.id };
}
