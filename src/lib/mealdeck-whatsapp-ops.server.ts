import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import { normaliseOrderNotes } from "./mealdeck-order-notes";
import { readMealDeckRuntimeConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";
import { requirePaymentOrigin, verifiedPaymentUser } from "./mealdeck-payment-server-core";
import {
  containsSensitiveWhatsAppDetails,
  readWhatsAppBody,
  WHATSAPP_NO_STORE,
} from "./mealdeck-whatsapp-transport.server";

const scope = { tenantId: z.uuid(), locationId: z.uuid() };
const inputSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...scope, action: z.literal("inbox") }),
  z.strictObject({ ...scope, action: z.enum(["takeover", "release"]), sessionId: z.uuid() }),
  z.strictObject({
    ...scope,
    action: z.literal("reply"),
    sessionId: z.uuid(),
    text: z.string().min(1).max(2000),
    requestId: z.uuid(),
  }),
]);

/** Actual staff identity + MFA + SQL permissions. No privileged fallback for staff. */
export async function handleWhatsAppOpsRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...WHATSAPP_NO_STORE, Allow: "POST" } });
    requirePaymentOrigin(request);
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
      throw new CheckoutProblem("invalid_request", "Use a JSON request.", 415);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(await readWhatsAppBody(request, 8192)));
    } catch {
      throw new CheckoutProblem("invalid_request", "Check this request.", 400);
    }
    const input = inputSchema.safeParse(body),
      config = readMealDeckRuntimeConfig(env, "luton");
    if (!config)
      throw new CheckoutProblem("whatsapp_unavailable", "The kitchen connection needs setup.", 503);
    if (
      !input.success ||
      input.data.tenantId !== config.tenantId ||
      input.data.locationId !== config.locationId
    )
      throw new CheckoutProblem("not_permitted", "Select the configured Luton kitchen.", 403);
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: fetcher,
        headers: { Authorization: request.headers.get("Authorization") ?? "" },
      },
    });
    await verifiedPaymentUser(request, client, true);
    const phoneId = env["MEALDECK_LUTON_WHATSAPP_PHONE_NUMBER_ID"]?.trim();
    if (!phoneId || !/^\d{5,30}$/.test(phoneId)) {
      if (input.data.action === "inbox")
        return Response.json({ configured: false, sessions: [] }, { headers: WHATSAPP_NO_STORE });
      throw new CheckoutProblem(
        "whatsapp_unavailable",
        "WhatsApp is not connected to this kitchen.",
        503,
      );
    }
    const params = {
      p_tenant: config.tenantId,
      p_location: config.locationId,
      p_phone_id: phoneId,
    };
    let result;
    if (input.data.action === "inbox") {
      result = await client.rpc("mealdeck_whatsapp_staff_inbox", params);
    } else if (input.data.action === "reply") {
      const text = normaliseOrderNotes(input.data.text);
      if (!text)
        throw new CheckoutProblem("invalid_message", "Write a message before sending.", 400);
      if (containsSensitiveWhatsAppDetails(text))
        throw new CheckoutProblem(
          "invalid_message",
          "Keep card details and credentials out of WhatsApp replies. Direct the customer to secure checkout.",
          400,
        );
      result = await client.rpc("mealdeck_whatsapp_staff_reply", {
        ...params,
        p_session: input.data.sessionId,
        p_text: text,
        p_request_id: input.data.requestId,
      });
    } else {
      result = await client.rpc("mealdeck_whatsapp_staff_control", {
        ...params,
        p_session: input.data.sessionId,
        p_action: input.data.action,
      });
    }
    if (result.error) {
      const message = String(result.error.message ?? "");
      if (/forbidden|permission|unauthor|mfa|scope/.test(message))
        throw new CheckoutProblem(
          "not_permitted",
          "Your current staff permissions do not allow this action.",
          403,
        );
      if (/window|staff|session|request/.test(message))
        throw new CheckoutProblem(
          "conversation_changed",
          "Refresh the conversation. Check your takeover and the customer reply window before sending.",
          409,
        );
      throw new CheckoutProblem(
        "whatsapp_unavailable",
        "WhatsApp conversations could not be loaded.",
        503,
      );
    }
    if (input.data.action === "inbox") {
      if (!Array.isArray(result.data)) throw new Error("Invalid inbox.");
      return Response.json(
        { configured: true, sessions: result.data },
        { headers: WHATSAPP_NO_STORE },
      );
    }
    return Response.json(
      input.data.action === "reply" && result.data && typeof result.data === "object"
        ? { applied: true, ...result.data }
        : { applied: true },
      { headers: WHATSAPP_NO_STORE },
    );
  } catch (error) {
    const problem =
      error instanceof CheckoutProblem
        ? error
        : new CheckoutProblem(
            "whatsapp_unavailable",
            "WhatsApp conversations could not be updated.",
            503,
          );
    return Response.json(
      { error: problem.code, message: problem.message },
      { status: problem.status, headers: WHATSAPP_NO_STORE },
    );
  }
}
