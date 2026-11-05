import { z } from "zod";
import {
  attemptResponseSchema,
  bootstrapSchema,
  terminalConfigSchema,
  terminalOrderSchema,
  terminalQuoteSchema,
  trustedOrigin,
  type Recovery,
} from "./types";
import { catalogueSchema, type SaleSelection } from "./catalogue";

export class TerminalApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
  ) {
    super(message);
    this.name = "TerminalApiError";
  }
}

export class TerminalApi {
  readonly origin: string;
  constructor(
    origin: string,
    private readonly accessToken: () => Promise<string | null>,
    private readonly send: typeof fetch = fetch,
    private readonly onAuthFailure?: (error: TerminalApiError) => void,
  ) {
    this.origin = trustedOrigin(origin);
  }

  async request<T>(
    action: string,
    body: Record<string, unknown>,
    schema: z.ZodType<T>,
    authenticated = true,
  ): Promise<T> {
    const token = authenticated ? await this.accessToken() : null;
    if (authenticated && !token)
      throw new TerminalApiError(
        "sign_in_required",
        "Sign in to your MealDeck staff account.",
        401,
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.send(this.origin + "/api/terminal", {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({ action, ...body }),
        signal: controller.signal,
      });
      if (response.url && new URL(response.url).origin !== this.origin)
        throw new TerminalApiError(
          "unexpected_server",
          "The payment server address changed. Ask your manager to check the app configuration.",
        );
      const raw: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ error: z.string(), message: z.string().max(1000) }).safeParse(raw);
        const failure = new TerminalApiError(
          error.success ? error.data.error : "request_failed",
          error.success
            ? error.data.message
            : "MealDeck could not complete this request. Check the existing payment before trying again.",
          response.status,
        );
        if (response.status === 401 || failure.code === "mfa_required")
          this.onAuthFailure?.(failure);
        throw failure;
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success)
        throw new TerminalApiError(
          "invalid_response",
          "MealDeck returned an incomplete payment record. Check this order before collecting again.",
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof TerminalApiError) throw error;
      throw new TerminalApiError(
        "connection_lost",
        "Connection interrupted. The payment result is not confirmed. Reconnect and check the same order.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  bootstrap() {
    return this.request("bootstrap", {}, bootstrapSchema, false);
  }
  config() {
    return this.request("config", {}, terminalConfigSchema);
  }
  async connectionToken() {
    const value = await this.request(
      "connection_token",
      {},
      z.object({ secret: z.string().min(1) }),
    );
    return value.secret;
  }
  async lookup(reference: string) {
    const value = await this.request(
      "lookup",
      { reference: reference.trim() },
      z.object({ order: terminalOrderSchema }),
    );
    return value.order;
  }
  prepare(recovery: Recovery) {
    return this.request("prepare", recovery, attemptResponseSchema);
  }
  reconcile(recovery: Recovery) {
    return this.request("reconcile", recovery, attemptResponseSchema);
  }
  cancel(recovery: Recovery) {
    return this.request("cancel", recovery, attemptResponseSchema);
  }
  catalogue() {
    return this.request("catalogue", {}, catalogueSchema);
  }
  async quote(selection: SaleSelection) {
    const result = await this.request("quote", selection, z.object({ quote: terminalQuoteSchema }));
    return result.quote;
  }
}
