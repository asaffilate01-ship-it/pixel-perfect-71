import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CheckoutProblem } from "./mealdeck-checkout-selection";
import { readMealDeckAuthEmailConfig } from "./mealdeck-auth-email.server";
import { readOnlineCheckoutStatus } from "./mealdeck-online-checkout.server";
import { readGroupLinkSecret } from "./mealdeck-shared-payments.server";
import {
  readMealDeckCheckoutServerKey,
  readMealDeckRuntimeConfig,
  type MealDeckRuntimeEnv,
} from "./mealdeck-runtime-config";
import {
  PAYMENT_NO_STORE,
  paymentErrorResponse,
  paymentObject,
  readPaymentInput,
  requirePaymentOrigin,
  verifiedPaymentUser,
} from "./mealdeck-payment-server-core";
import {
  readMealDeckStripeConfig,
  readMealDeckStripeSettingIssues,
  stripeRequest,
} from "./mealdeck-stripe.server";
import { readMealDeckStripeCheckoutDomain } from "./mealdeck-stripe-checkout-domain.server";
import {
  integrationStatusSchema,
  type MealDeckIntegrationCheck,
} from "./mealdeck-integration-status";

const inputSchema = z.strictObject({
  action: z.literal("status"),
  tenantId: z.uuid(),
  locationId: z.uuid(),
});
const accessSchema = z.object({
  tenant_id: z.uuid(),
  location_id: z.uuid().nullable(),
  role: z.string(),
});

/** Read-only owner/admin diagnostics. Never creates provider objects or sends mail. */
export async function handleIntegrationStatusRequest(
  request: Request,
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (request.method !== "POST")
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: { ...PAYMENT_NO_STORE, Allow: "POST" } },
      );
    requirePaymentOrigin(request);
    const input = inputSchema.safeParse(await readPaymentInput(request, 4096));
    if (!input.success)
      throw new CheckoutProblem("invalid_request", "Choose the configured Luton kitchen.", 400);
    const config = readMealDeckRuntimeConfig(env, "luton");
    if (!config)
      throw new CheckoutProblem(
        "setup_required",
        "The dedicated MealDeck kitchen connection needs setup.",
        503,
      );
    if (input.data.tenantId !== config.tenantId || input.data.locationId !== config.locationId)
      throw new CheckoutProblem(
        "not_permitted",
        "These connections belong to the configured Luton kitchen.",
        403,
      );
    // Use the public project key and the actual staff token. No service-role read
    // is used to grant access; the current database policies remain authoritative.
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: fetcher,
        headers: { Authorization: request.headers.get("Authorization") ?? "" },
      },
    });
    await verifiedPaymentUser(request, client, true);
    const accessResult = await client.rpc("mealdeck_ops_my_access");
    const accesses = z.array(accessSchema).safeParse(accessResult.data);
    if (
      accessResult.error ||
      !accesses.success ||
      !accesses.data.some(
        (access) =>
          access.tenant_id === config.tenantId &&
          (access.location_id === null || access.location_id === config.locationId) &&
          ["owner", "admin"].includes(access.role),
      )
    )
      throw new CheckoutProblem(
        "not_permitted",
        "Only an authorised kitchen owner or administrator can check these connections.",
        403,
      );
    // Enforces current identity, MFA, finance.manage and explicit denials in SQL.
    const settings = await client.rpc("mealdeck_ops_checkout_settings", {
      p_tenant: config.tenantId,
      p_location: config.locationId,
    });
    if (settings.error || !settings.data || typeof settings.data !== "object")
      throw new CheckoutProblem(
        "not_permitted",
        "Your current account cannot inspect this kitchen's payment setup.",
        403,
      );

    const checks: MealDeckIntegrationCheck[] = [];
    const add = (
      id: MealDeckIntegrationCheck["id"],
      label: string,
      state: MealDeckIntegrationCheck["state"],
      detail: string,
      settings: string[] = [],
    ) => {
      checks.push({ id, label, state, detail, settings });
    };
    const serviceKey = readMealDeckCheckoutServerKey(env, config);
    const stripe = readMealDeckStripeConfig(env);
    const stripeIssues = readMealDeckStripeSettingIssues(env);
    const domain = readMealDeckStripeCheckoutDomain(env);
    const terminalId = env["MEALDECK_STRIPE_TERMINAL_LOCATION_ID"]?.trim();
    const validTerminalId = !!terminalId && /^tml_[A-Za-z0-9]+$/.test(terminalId);
    let providerAccountChecked = false;
    let providerTerminalChecked = false;
    let accountCountry: unknown;
    if (stripe) {
      try {
        const account = await stripeRequest(stripe, "account", fetcher);
        providerAccountChecked =
          account["id"] === stripe.accountId && account["charges_enabled"] === true;
        accountCountry = account["country"];
        if (providerAccountChecked && accountCountry === "GB" && validTerminalId) {
          const location = await stripeRequest(stripe, "terminal/locations/" + terminalId, fetcher);
          providerTerminalChecked =
            location["id"] === terminalId &&
            location["livemode"] === stripe.livemode &&
            paymentObject(location["address"])["country"] === "GB";
        }
      } catch {
        // Keep successful account evidence if only the location request failed.
        // Raw provider errors, credentials and identifiers never enter the report.
      }
    }
    const publicApprovalPending = env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"] !== "signed-off";
    const checkoutSetupReady =
      !!serviceKey &&
      !!stripe &&
      domain.status !== "invalid" &&
      env["MEALDECK_ONLINE_CHECKOUT_ENABLED"] === "true";
    const checkoutConfigured = checkoutSetupReady && !publicApprovalPending;
    const checkoutIssues: { setting: string; status: string }[] = [];
    if (!serviceKey)
      checkoutIssues.push({
        setting: "MEALDECK_CHECKOUT_SERVER_KEY",
        status: "missing or invalid",
      });
    if (env["MEALDECK_ONLINE_CHECKOUT_ENABLED"] !== "true")
      checkoutIssues.push({
        setting: "MEALDECK_ONLINE_CHECKOUT_ENABLED",
        status: !env["MEALDECK_ONLINE_CHECKOUT_ENABLED"]?.trim()
          ? "missing"
          : env["MEALDECK_ONLINE_CHECKOUT_ENABLED"] === "false"
            ? "disabled"
            : "invalid",
      });
    if (domain.status === "invalid")
      checkoutIssues.push({ setting: "MEALDECK_STRIPE_CHECKOUT_HOST", status: "invalid" });
    const sharedConfigured =
      checkoutConfigured &&
      env["MEALDECK_SHARED_PAYMENTS_ENABLED"] === "true" &&
      !!readGroupLinkSecret(env);
    const terminalConfigured =
      !!serviceKey &&
      !!stripe &&
      validTerminalId &&
      env["MEALDECK_TERMINAL_ENABLED"] === "true" &&
      env["MEALDECK_TERMINAL_INTEGRATION_APPROVED"] === "signed-off" &&
      env["MEALDECK_CHECKOUT_INTEGRATION_APPROVED"] === "signed-off" &&
      !(stripe.livemode && env["MEALDECK_TERMINAL_SIMULATED"] === "true");
    const email = readMealDeckAuthEmailConfig(env);
    const online = await readOnlineCheckoutStatus(env, fetcher);
    add(
      "database",
      "MealDeck database",
      "checked",
      "Current staff identity, administrator role and kitchen finance permission were checked in the dedicated MealDeck database.",
    );
    add(
      "stripe",
      "Stripe account",
      providerAccountChecked ? "checked" : "needs_setup",
      providerAccountChecked
        ? "Stripe returned the configured merchant account with charges enabled. A completed payment and webhook acceptance still need separate verification."
        : stripe
          ? "The configured merchant account or its ability to accept charges could not be confirmed with Stripe. Check the account connection and retry."
          : stripeIssues
              .map(
                (issue) =>
                  `${issue.setting}: ${issue.status === "mode_mismatch" ? "invalid (key/mode mismatch)" : issue.status}.`,
              )
              .join(" "),
      stripeIssues.map((issue) => issue.setting),
    );
    add(
      "checkout",
      "Website checkout",
      checkoutConfigured ? "configured" : checkoutSetupReady ? "unverified" : "needs_setup",
      checkoutConfigured
        ? "Server checkout settings are present. New orders also require the current kitchen, catalogue, opening hours and Stripe account checks."
        : [
            ...checkoutIssues.map((issue) => `${issue.setting}: ${issue.status}.`),
            ...(!stripe ? ["Stripe configuration needs setup; see the Stripe account check."] : []),
            ...(publicApprovalPending
              ? [
                  "Public checkout approval is pending. Keep it pending until the private live payment and kitchen verification are complete.",
                ]
              : []),
          ].join(" "),
      checkoutIssues.map((issue) => issue.setting),
    );
    add(
      "domain",
      "Branded Stripe checkout",
      domain.status === "invalid" ? "needs_setup" : "unverified",
      domain.status === "configured"
        ? "pay.mealdeck.co.uk is allowed by the app. Confirm Active in Stripe and check a Stripe-created session uses it; DNS alone does not prove activation."
        : domain.status === "default"
          ? "The app currently uses Stripe's standard checkout host. Once the custom-domain migration is installed and Stripe shows Active, configure pay.mealdeck.co.uk."
          : "The checkout host setting is invalid. Use the exact approved hostname pay.mealdeck.co.uk or leave it unset for Stripe's standard host.",
      ["MEALDECK_STRIPE_CHECKOUT_HOST"],
    );
    add(
      "shared",
      "Separate and shared payments",
      sharedConfigured ? "configured" : "needs_setup",
      sharedConfigured
        ? "Group-payment settings are present. The server keeps each payment with the original order and releases the kitchen order only after full verified funding."
        : "Website checkout, shared-payment activation and a private invitation-link signing secret must be configured before groups can pay separately.",
      sharedConfigured ? [] : ["MEALDECK_SHARED_PAYMENTS_ENABLED", "MEALDECK_GROUP_LINK_SECRET"],
    );
    add(
      "terminal",
      "Tap to Pay on staff phones",
      terminalConfigured && providerTerminalChecked ? "configured" : "needs_setup",
      terminalConfigured && providerTerminalChecked
        ? "The GB Stripe location and server settings were checked. Install the signed staff app and complete physical iPhone/Android payment acceptance before service."
        : "Complete phone-payment settings, a matching GB Stripe Terminal location and native-device acceptance. A live account cannot use a simulated reader.",
      terminalConfigured && providerTerminalChecked
        ? []
        : [
            "MEALDECK_STRIPE_TERMINAL_LOCATION_ID",
            "MEALDECK_TERMINAL_ENABLED",
            "MEALDECK_TERMINAL_INTEGRATION_APPROVED",
            "MEALDECK_TERMINAL_SIMULATED",
          ],
    );
    add(
      "email",
      "Branded account emails",
      email ? "configured" : "unverified",
      email
        ? "The signed Resend email-hook settings are present. The Auth host must have this hook connected with a verified sending domain. No email was sent by this check."
        : "The application cannot verify managed Auth SMTP settings. Connect supported Resend SMTP or the signed Send Email Hook, then verify delivery and confirmation. An API key alone does not switch Auth email delivery.",
      email
        ? []
        : [
            "RESEND_API_KEY",
            "MEALDECK_AUTH_EMAIL_FROM",
            "MEALDECK_AUTH_EMAIL_HOOK_SECRET",
            "MEALDECK_AUTH_EMAIL_ENABLED",
          ],
    );
    add(
      "kitchen",
      "Current ordering availability",
      online.available && providerAccountChecked ? "checked" : "needs_setup",
      online.available && providerAccountChecked
        ? "The current website admission checks allow new collection and kerbside orders. Each basket is repriced and checked again before payment."
        : "New website orders are unavailable now. Check the kitchen state, pickup estimate, opening hours, published menu and payment setup. Existing payments can still reconcile.",
    );
    return Response.json(
      integrationStatusSchema.parse({
        checkedAt: new Date().toISOString(),
        tenantId: config.tenantId,
        locationId: config.locationId,
        mode: stripe ? (stripe.livemode ? "live" : "test") : "unconfigured",
        acceptingOnlineOrders: online.available && providerAccountChecked,
        checks,
      }),
      { headers: PAYMENT_NO_STORE },
    );
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
