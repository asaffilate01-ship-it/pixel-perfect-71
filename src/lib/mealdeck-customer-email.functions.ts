import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { normalizeCustomerEmail, normalizeCustomerName, normalizeCustomerPhone } from "./mealdeck-customer";
import { customerReturnTarget } from "./mealdeck-customer-return";
import type { CustomerEmailInput, CustomerEmailResult } from "./mealdeck-customer-email.server";

function validate(input: unknown): CustomerEmailInput {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const kind = value["kind"];
  if (kind !== "register" && kind !== "signin" && kind !== "recovery") throw new Error("invalid_request");
  const email = normalizeCustomerEmail(typeof value["email"] === "string" ? value["email"] : "");
  if (!email) throw new Error("invalid_email");
  let name: string | undefined;
  let phone: string | undefined;
  if (kind === "register") {
    name = normalizeCustomerName(typeof value["name"] === "string" ? value["name"] : "") ?? undefined;
    phone = normalizeCustomerPhone(typeof value["phone"] === "string" ? value["phone"] : "") ?? undefined;
    if (!name || !phone) throw new Error("invalid_registration");
  }
  return { kind, email, name, phone, returnTo: customerReturnTarget(value["returnTo"]) };
}

/** Public: anyone may ask for an email to an address; the email itself proves ownership. */
export const requestMealDeckCustomerEmail = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }): Promise<CustomerEmailResult> => {
    setResponseHeader("Cache-Control", "no-store, private");
    const { sendMealDeckCustomerEmail } = await import("./mealdeck-customer-email.server");
    try {
      return await sendMealDeckCustomerEmail(data, process.env);
    } catch (error) {
      console.error("MealDeck customer email failed:", error instanceof Error ? error.message : error);
      return { ok: false, reason: "unavailable" };
    }
  });
