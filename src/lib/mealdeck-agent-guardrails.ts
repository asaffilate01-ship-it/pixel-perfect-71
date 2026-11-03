/**
 * MealDeck Phase 20 — provider-neutral AI/MCP policy.
 * Planning only: callers MUST construct trustedContext on an authenticated
 * server from actual Dishbee/Omniqora identity, scopes and remaining budget.
 * Never pass a model-generated context or expose the policy as an auth oracle.
 * This file does not execute tools or start an agent.
 */
export type AgentToolRequest = {
  tool: string;
  tenantId?: string;
  locationId?: string;
  orderId?: string;
};
export type TrustedAgentContext = {
  serverAuthenticated: boolean;
  role: "anonymous" | "customer" | "staff";
  tenantId?: string;
  allowedLocationIds: readonly string[];
  verifiedOrderIds: readonly string[];
  permissions: readonly string[];
  remainingCalls: number;
};
export type AgentDecision = {
  allowed: boolean;
  humanHandoff: boolean;
  scope: "public" | "customer_status" | "aggregate_only" | "none";
  reason: "allowed" | "server_required" | "budget_exhausted" |
    "invalid_request" | "scope_denied" | "human_required" | "tool_denied";
};
const TOOL_KEYS = new Set(["tool", "tenantId", "locationId", "orderId"]);
const PUBLIC_TOOLS = new Set([
  "menu.public_catalogue", "location.public_hours", "basket.pairings",
]);
const DENIED_TOOLS = new Set([
  "checkout.create", "order.mark_paid", "order.cancel", "order.modify",
  "payment.authorise", "payment.capture", "payment.refund", "kds.release",
  "courier.quote", "courier.book", "fulfilment.complete", "inventory.write",
  "finance.read", "recipe.read", "customer.search", "sql.execute",
  "mcp.execute", "web.fetch", "shell.execute",
]);
const approvedString = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const decision = (reason: AgentDecision["reason"],
  scope: AgentDecision["scope"] = "none"): AgentDecision =>
  ({ allowed: reason === "allowed", humanHandoff: reason === "human_required", scope, reason });

/** Fail-closed tool admission. Does not run, verify or authorize any transaction. */
export function authoriseAgentTool(
  request: AgentToolRequest, trustedContext: TrustedAgentContext,
): AgentDecision {
  if (!trustedContext.serverAuthenticated) return decision("server_required");
  if (!Number.isSafeInteger(trustedContext.remainingCalls) ||
    trustedContext.remainingCalls < 1 || trustedContext.remainingCalls > 50) {
    return decision("budget_exhausted");
  }
  if (!request || typeof request !== "object" ||
    Object.keys(request).some(key => !TOOL_KEYS.has(key)) ||
    typeof request.tool !== "string" || request.tool.length > 80 ||
    (request.tenantId !== undefined && !approvedString(request.tenantId)) ||
    (request.locationId !== undefined && !approvedString(request.locationId)) ||
    (request.orderId !== undefined && !approvedString(request.orderId))) {
    return decision("invalid_request");
  }
  if (request.tool === "allergen.human_handoff" ||
    request.tool === "support.human_handoff") return decision("human_required");
  if (DENIED_TOOLS.has(request.tool)) return decision("tool_denied");
  if (PUBLIC_TOOLS.has(request.tool)) {
    // Public tooling may never be tricked into looking up a private order.
    if (request.orderId || request.tenantId) return decision("scope_denied");
    // A public location identifier must be approved by the trusted server.
    if (request.locationId &&
      !trustedContext.allowedLocationIds.includes(request.locationId)) {
      return decision("scope_denied");
    }
    return decision("allowed", "public");
  }
  if (request.tool === "order.public_status") {
    if (trustedContext.role !== "customer" || !request.orderId ||
      !request.tenantId || !request.locationId ||
      trustedContext.tenantId !== request.tenantId ||
      !trustedContext.allowedLocationIds.includes(request.locationId) ||
      !trustedContext.verifiedOrderIds.includes(request.orderId)) {
      return decision("scope_denied");
    }
    return decision("allowed", "customer_status");
  }
  if (request.tool === "ops.aggregate_analytics") {
    if (trustedContext.role !== "staff" ||
      !request.tenantId || !request.locationId ||
      trustedContext.tenantId !== request.tenantId ||
      !trustedContext.allowedLocationIds.includes(request.locationId) ||
      !trustedContext.permissions.includes("analytics.read") ||
      request.orderId) return decision("scope_denied");
    return decision("allowed", "aggregate_only");
  }
  return decision("tool_denied");
}
