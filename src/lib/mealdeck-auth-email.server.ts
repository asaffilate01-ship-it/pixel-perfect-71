import { createHash } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { readMealDeckBackendConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import {
  AUTH_EMAIL_KINDS,
  renderMealDeckAuthEmail,
  type AuthEmailKind,
} from "./mealdeck-auth-email-templates";
import {
  AUTH_EMAIL_SITE_ORIGIN,
  authEmailConfirmationUrl,
  isAuthTokenHash,
  safeAuthEmailRedirect,
  safeAuthProviderUrl,
} from "./mealdeck-auth-email-links";

const noStore = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const mailbox = z
  .email()
  .max(254)
  .refine((value) => !/[\r\n]/.test(value) && !value.includes("\0"));
const optionalText = z.string().max(6000).optional();
const eventSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.union([mailbox, z.literal("")]).optional(),
    new_email: z.union([mailbox, z.literal("")]).optional(),
  }),
  email_data: z.object({
    email_action_type: z.enum(AUTH_EMAIL_KINDS),
    token: optionalText,
    token_hash: optionalText,
    token_new: optionalText,
    token_hash_new: optionalText,
    redirect_to: optionalText,
    old_email: z.union([mailbox, z.literal("")]).optional(),
  }),
});
type Config = { authOrigin: string; apiKey: string; from: string; hookSecrets: string[] };
type Email = { from: string; to: string[]; subject: string; html: string; text: string };
class EmailProblem extends Error {
  constructor(
    readonly status: number,
    text: string,
  ) {
    super(text);
  }
}
const badInput = () => new EmailProblem(400, "This account email request could not be accepted.");

function readHookSecret(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^v1,/, "");
  if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value.slice(6), "base64");
  return bytes.length >= 24 && bytes.length <= 64 && bytes.toString("base64") === value.slice(6)
    ? value
    : null;
}

/** Unconfigured by default; no generic/Dishbee backend or browser-secret fallbacks. */
export function readMealDeckAuthEmailConfig(env: MealDeckRuntimeEnv): Config | null {
  if (env["MEALDECK_AUTH_EMAIL_ENABLED"] !== "true") return null;
  const backend = readMealDeckBackendConfig(env);
  const apiKey = env["RESEND_API_KEY"]?.trim();
  const from = env["MEALDECK_AUTH_EMAIL_FROM"]?.trim();
  const primary = readHookSecret(env["MEALDECK_AUTH_EMAIL_HOOK_SECRET"]);
  const previousRaw = env["MEALDECK_AUTH_EMAIL_PREVIOUS_HOOK_SECRET"]?.trim();
  const previous = previousRaw ? readHookSecret(previousRaw) : null;
  if (
    backend.status !== "ready" ||
    !apiKey ||
    !/^re_[A-Za-z0-9_-]{16,256}$/.test(apiKey) ||
    !from ||
    !mailbox.safeParse(from).success ||
    !/(?:@|\.)mealdeck\.co\.uk$/i.test(from) ||
    !primary ||
    (previousRaw && !previous)
  )
    return null;
  return {
    authOrigin: backend.backend.url,
    apiKey,
    from: "MealDeck <" + from + ">",
    hookSecrets: previous ? [primary, previous] : [primary],
  };
}

/** Called only after signature verification. Supabase remains the token/identity authority. */
export function buildMealDeckAuthEmails(
  input: unknown,
  config: Pick<Config, "authOrigin" | "from">,
): Email[] {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) throw badInput();
  const { user, email_data: data } = parsed.data;
  const kind = data.email_action_type;
  const recipient = kind === "email_changed_notification" ? data.old_email : user.email;
  if (kind.endsWith("_notification")) {
    if (!recipient) throw badInput();
    return [{ from: config.from, to: [recipient], ...renderMealDeckAuthEmail(kind) }];
  }
  const code = (value: string | undefined) => {
    if (!value || !/^\d{6,10}$/.test(value)) throw badInput();
    return value;
  };
  if (kind === "reauthentication") {
    if (!user.email) throw badInput();
    return [
      {
        from: config.from,
        to: [user.email],
        ...renderMealDeckAuthEmail(kind, { code: code(data.token) }),
      },
    ];
  }
  const redirect = safeAuthEmailRedirect(data.redirect_to || AUTH_EMAIL_SITE_ORIGIN + "/account");
  if (!redirect) throw badInput();
  const email = (
    address: string | undefined,
    token: string | undefined,
    tokenHash: string | undefined,
  ): Email => {
    if (!address || !tokenHash || !isAuthTokenHash(tokenHash)) throw badInput();
    const provider = new URL("/auth/v1/verify", config.authOrigin);
    provider.search = new URLSearchParams({
      token: tokenHash,
      type: kind,
      redirect_to: redirect,
    }).toString();
    const verifiedUrl = safeAuthProviderUrl(provider.href, config.authOrigin);
    if (!verifiedUrl) throw badInput();
    return {
      from: config.from,
      to: [address],
      ...renderMealDeckAuthEmail(kind, {
        code: code(token),
        confirmationUrl: authEmailConfirmationUrl(verifiedUrl),
      }),
    };
  };
  if (kind === "email_change") {
    if (!user.new_email) throw badInput();
    // Supabase's historical names are reversed: token_hash_new belongs to CURRENT email.
    if (data.token_hash_new)
      return [
        email(user.email, data.token, data.token_hash_new),
        email(user.new_email, data.token_new, data.token_hash),
      ];
    return [email(user.new_email, data.token_new || data.token, data.token_hash)];
  }
  return [email(user.email, data.token, data.token_hash)];
}

async function boundedRawBody(request: Request): Promise<string> {
  const maximum = 65_536;
  const stated = request.headers.get("content-length");
  if (stated && (!/^\d+$/.test(stated) || Number(stated) > maximum))
    throw new EmailProblem(413, "Email request too large.");
  if (!request.body) throw badInput();
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new EmailProblem(413, "Email request too large.");
      }
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw badInput();
  }
}

export async function handleMealDeckAuthEmail(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  try {
    if (request.method !== "POST")
      return Response.json(
        { error: { http_code: 405, message: "Method not allowed." } },
        { status: 405, headers: { ...noStore, Allow: "POST" } },
      );
    const config = readMealDeckAuthEmailConfig(env);
    if (!config) throw new EmailProblem(503, "MealDeck account email is not configured.");
    if (
      request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
    )
      throw new EmailProblem(415, "A JSON email request is required.");
    const id = request.headers.get("webhook-id") ?? "";
    const timestamp = request.headers.get("webhook-timestamp") ?? "";
    const signature = request.headers.get("webhook-signature") ?? "";
    if (
      !/^[A-Za-z0-9_-]{1,200}$/.test(id) ||
      !/^[1-9]\d{9}$/.test(timestamp) ||
      signature.length > 2048
    )
      throw new EmailProblem(401, "Invalid email request signature.");
    const raw = await boundedRawBody(request);
    let event: unknown;
    for (const secret of config.hookSecrets) {
      try {
        event = new Webhook(secret).verify(raw, {
          "webhook-id": id,
          "webhook-timestamp": timestamp,
          "webhook-signature": signature,
        });
        break;
      } catch {
        /* Try only the configured rotation secret. */
      }
    }
    if (!event) throw new EmailProblem(401, "Invalid email request signature.");
    const emails = buildMealDeckAuthEmails(event, config);
    const idempotencyKey =
      "mealdeck-auth-" +
      createHash("sha256")
        .update(config.authOrigin + "\0" + id)
        .digest("hex");
    // One batch includes both secure-email-change recipients. No auto retry or key substitution.
    const response = await fetcher("https://api.resend.com/emails/batch", {
      method: "POST",
      // Workers supports manual redirects; reject them below without forwarding
      // the provider key or account email to another destination.
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(emails),
    });
    if (!response.ok)
      throw new EmailProblem(
        503,
        "MealDeck account email could not be sent. Please try again shortly.",
      );
    const result = z
      .object({ data: z.array(z.object({ id: z.uuid() })) })
      .safeParse(await response.json());
    if (!result.success || result.data.data.length !== emails.length)
      throw new EmailProblem(
        503,
        "MealDeck account email could not be confirmed. Please try again shortly.",
      );
    // Provider acceptance is not delivery, Auth verification, registration, or staff permission.
    return Response.json({}, { headers: noStore });
  } catch (error) {
    const problem =
      error instanceof EmailProblem
        ? error
        : new EmailProblem(
            503,
            "MealDeck account email could not be sent. Please try again shortly.",
          );
    return Response.json(
      { error: { http_code: problem.status, message: problem.message } },
      { status: problem.status, headers: noStore },
    );
  }
}
