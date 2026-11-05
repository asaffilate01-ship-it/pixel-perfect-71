import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMealDeckPublicBackend } from "./mealdeck-backend.functions";
import {
  createMealDeckBackendClientCache,
  MealDeckBackendSetupError,
} from "./mealdeck-backend-client-cache";

/**
 * Browser-only authenticated staff client for MealDeck's independent database.
 * Its validated public connection comes from the same server configuration used
 * by public catalogue/tracking clients. NEVER use a service-role key here.
 */
const clients = createMealDeckBackendClientCache<SupabaseClient>({
  read: () => getMealDeckPublicBackend(),
  create: ({ url, publishableKey }) =>
    createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: `mealdeck-ops-${new URL(url).hostname}-auth-token`,
      },
      global: { headers: { "X-Client-Info": "mealdeck-ops-web" } },
    }),
  retire: (client) => {
    void client.auth.stopAutoRefresh().catch(() => {});
  },
});

export async function initializeMealDeckOpsClient(refresh = false): Promise<SupabaseClient> {
  if (typeof window === "undefined") throw new Error("mealdeck_ops_browser_only");
  try {
    return await clients.initialise(refresh);
  } catch (reason) {
    throw new OpsRequestError(
      "unconfigured",
      reason instanceof MealDeckBackendSetupError
        ? reason.message
        : "MealDeck’s staff connection could not be loaded. Please retry or ask your administrator to check the dedicated database settings.",
    );
  }
}

export function resetMealDeckOpsClient() {
  clients.reset();
}

export function getMealDeckOpsClient(): SupabaseClient {
  if (typeof window === "undefined") throw new Error("mealdeck_ops_browser_only");
  const client = clients.get();
  if (!client)
    throw new OpsRequestError(
      "unconfigured",
      "MealDeck’s staff connection is not ready. Please sign in again.",
    );
  return client;
}

export type OpsAccess = {
  access_id: string;
  tenant_id: string;
  tenant_name: string;
  location_id: string | null;
  role: OpsRole;
  grant_permissions: string[];
  deny_permissions: string[];
};
export type OpsRole =
  "owner" | "admin" | "operations" | "kitchen" | "menu" | "finance" | "analyst" | "viewer";

export type OpsRequestErrorCode =
  | "forbidden"
  | "unauthenticated"
  | "unconfigured"
  | "conflict"
  | "invalid_transition"
  | "unavailable";

/** Reviewed operational failures only; never expose raw SQL or private identifiers. */
export class OpsRequestError extends Error {
  constructor(
    public readonly code: OpsRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OpsRequestError";
  }
}

export async function opsRpc<T>(
  name: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const db = getMealDeckOpsClient();
  // Every private RPC checks the signed-in user via auth.uid() and verifies
  // explicit per-tenant/location permissions. UI visibility is not authority.
  const { data, error } = await db.rpc(name, parameters);
  if (clients.get() !== db) {
    throw new OpsRequestError(
      "unauthenticated",
      "Your staff connection has changed. Sign in again to continue.",
    );
  }
  if (error) {
    if (
      error.code === "PGRST301" ||
      error.code === "PGRST302" ||
      /jwt.*expired|not_authenticated|unauthenticated/i.test(error.message)
    ) {
      throw new OpsRequestError(
        "unauthenticated",
        "Your staff session has expired. Sign in again to continue.",
      );
    }
    if (error.code === "42501" || /forbidden|permission/i.test(error.message)) {
      throw new OpsRequestError(
        "forbidden",
        "Your staff role is not permitted to access this area.",
      );
    }
    if (name.startsWith("mealdeck_ops_modifier_")) {
      if (error.code === "PGRST202") {
        throw new OpsRequestError(
          "unconfigured",
          "Shared option price editing is not installed yet. Ask your administrator to finish the menu setup.",
        );
      }
      if (/mealdeck_ops_modifier_price_conflict/.test(error.message)) {
        throw new OpsRequestError(
          "conflict",
          "This option price changed on another screen. Review the latest saved price before trying again.",
        );
      }
      if (/mealdeck_ops_modifier_invalid_price/.test(error.message)) {
        throw new OpsRequestError(
          "unavailable",
          "Enter a price from £0.00 to £10,000.00 with no more than two decimals.",
        );
      }
      if (/mealdeck_ops_modifier_not_found/.test(error.message)) {
        throw new OpsRequestError(
          "unavailable",
          "This option is no longer available. Reload the option prices and choose another option.",
        );
      }
    }
    if (name.startsWith("mealdeck_ops_kds_")) {
      if (/mealdeck_kds_handoff_code_required/.test(error.message))
        throw new OpsRequestError(
          "invalid_transition",
          "Check the four-digit order number with the customer.",
        );
      if (
        /mealdeck_kds_(all_items_required|accept_required|start_required|packing_locked)/.test(
          error.message,
        )
      )
        throw new OpsRequestError(
          "invalid_transition",
          "Accept and start this order, then tick every item before packing. Packed orders cannot be changed.",
        );
      if (/mealdeck_kds_instructions_unavailable/i.test(error.message)) {
        throw new OpsRequestError(
          "unavailable",
          "An order has food instructions that need an operations review. Kitchen changes are paused until those instructions can be checked in full.",
        );
      }
      if (
        error.code === "PGRST202" ||
        /mealdeck_kds_(setup_required|authority_unavailable|not_configured)/i.test(error.message)
      ) {
        throw new OpsRequestError(
          "unconfigured",
          "The kitchen connection needs setup. Ask your administrator to connect and verify the approved order feed.",
        );
      }
      if (/mealdeck_kds_(conflict|stale|version_mismatch)/i.test(error.message)) {
        throw new OpsRequestError(
          "conflict",
          "This ticket changed on another screen. The latest kitchen state is being refreshed.",
        );
      }
      if (
        /mealdeck_kds_(invalid_transition|not_ready|routing_incomplete|payment_required|release_required|order_unavailable|not_eligible)/i.test(
          error.message,
        )
      ) {
        throw new OpsRequestError(
          "invalid_transition",
          "This order cannot move to that stage. Refresh the kitchen screen and check its current status.",
        );
      }
    }
    // Narrow, reviewed operational errors are translated without returning
    // raw SQL, database schema details, user IDs or provider credentials.
    if (name === "mealdeck_ops_kitchen_stations" && error.code === "PGRST202") {
      throw new OpsRequestError(
        "unconfigured",
        "Kitchen preparation setup is not installed yet. Ask your administrator to finish the MealDeck database setup.",
      );
    }
    const menuFailures: readonly [string, string][] = [
      [
        "mealdeck_ops_route_has_active_orders",
        "This product is used by an order still in the kitchen. Finish those orders before changing its preparation route.",
      ],
      [
        "mealdeck_ops_station_route_required_before_activation",
        "Assign the draft product to a preparation station in this kitchen before activating it.",
      ],
      [
        "mealdeck_ops_location_or_item_mismatch",
        "The product or preparation station is no longer available for this kitchen. Reload the menu and try again.",
      ],
    ];
    const menuFailure = menuFailures.find(([code]) => error.message.includes(code));
    if (menuFailure) throw new Error(menuFailure[1]);
    const invoiceFailures: readonly [string, string][] = [
      [
        "mealdeck_ops_invoice_totals_mismatch",
        "Invoice lines must total exactly to the supplier's stated net and VAT.",
      ],
      [
        "mealdeck_ops_invoice_unreceived_goods",
        "Record and approve the physical delivery receipt before matching this quantity.",
      ],
      [
        "mealdeck_ops_invoice_goods_already_claimed",
        "These received goods are already claimed by another matched or approved invoice.",
      ],
      [
        "mealdeck_ops_invoice_price_variance",
        "Supplier net price differs from the approved purchase order beyond rounding tolerance.",
      ],
      [
        "mealdeck_ops_invoice_tax_category_missing",
        "Review the tax category on every invoice line before confirming the tax document.",
      ],
      [
        "mealdeck_ops_invoice_second_approver_required",
        "A different, tenant-wide finance manager must approve this reviewed invoice.",
      ],
      [
        "mealdeck_ops_invoice_tax_not_reviewable",
        "Tax evidence can only be reviewed after a successful goods/PO match.",
      ],
      [
        "mealdeck_ops_invoice_not_matchable",
        "This invoice cannot be matched until it is submitted and the purchase order is approved.",
      ],
      [
        "mealdeck_ops_credit_exceeds_invoice",
        "Approved credit notes cannot exceed the original invoice net or VAT.",
      ],
      [
        "mealdeck_ops_credit_second_approver_required",
        "A separate tenant-wide finance manager must approve this credit.",
      ],
      [
        "mealdeck_ops_credit_requires_approved_invoice",
        "Only an approved supplier invoice can receive a supplier credit note.",
      ],
      [
        "mealdeck_ops_invoice_not_editable",
        "This supplier invoice can no longer be edited. Use a reviewed credit or void an unapproved invoice.",
      ],
    ];
    const known = invoiceFailures.find(([code]) => error.message.includes(code));
    if (known) throw new Error(known[1]);
    if (error.code === "23505" && /mealdeck_ops_supplier_(invoices|credits)/i.test(error.message)) {
      throw new Error(
        "This supplier invoice or credit note number already exists. Verify the original record instead of submitting it twice.",
      );
    }
    throw new OpsRequestError(
      "unavailable",
      "The operations request failed. Verify your access and try again.",
    );
  }
  return data as T;
}
export function opsRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : value == null ? [] : [value as T];
}
