import { describe, expect, test } from "bun:test";
import {
  authoriseAgentTool, type TrustedAgentContext,
} from "../src/lib/mealdeck-agent-guardrails";

const context = (patch: Partial<TrustedAgentContext> = {}): TrustedAgentContext => ({
  serverAuthenticated: true, role: "anonymous", tenantId: undefined,
  allowedLocationIds: ["luton"], verifiedOrderIds: [], permissions: [],
  remainingCalls: 8, ...patch,
});
describe("Phase 20: provider-neutral AI and MCP fail-closed guardrails", () => {
  test("anonymous public catalogue can be read from approved location only", () => {
    expect(authoriseAgentTool({ tool: "menu.public_catalogue", locationId: "luton" },
      context()).scope).toBe("public");
    expect(authoriseAgentTool({ tool: "menu.public_catalogue", locationId: "different_kitchen" },
      context()).allowed).toBe(false);
  });
  test("model must never create an order or declare a payment", () => {
    for (const tool of ["checkout.create", "order.mark_paid", "payment.capture",
      "payment.refund", "kds.release", "courier.book", "fulfilment.complete"]) {
      expect(authoriseAgentTool({ tool }, context({ role: "staff" })).allowed).toBe(false);
    }
  });
  test("unregistered MCP, shell, HTTP and direct SQL tools fail closed", () => {
    for (const tool of ["mcp.execute", "shell.execute", "web.fetch", "sql.execute", "unknown.new_tool"]) {
      expect(authoriseAgentTool({ tool }, context()).allowed).toBe(false);
    }
  });
  test("no unauthenticated server, no unlimited tool budget", () => {
    expect(authoriseAgentTool({ tool: "basket.pairings" },
      context({ serverAuthenticated: false })).reason).toBe("server_required");
    expect(authoriseAgentTool({ tool: "basket.pairings" },
      context({ remainingCalls: 0 })).reason).toBe("budget_exhausted");
  });
  test("allergen answers require a real kitchen/human escalation", () => {
    const result = authoriseAgentTool({ tool: "allergen.human_handoff" }, context());
    expect(result.allowed).toBe(false);
    expect(result.humanHandoff).toBe(true);
  });
  test("order status is only available for a server-verified customer order", () => {
    const owned = context({
      role: "customer", tenantId: "meal_313",
      verifiedOrderIds: ["ord_123"], allowedLocationIds: ["luton"],
    });
    const target = { tool: "order.public_status", orderId: "ord_123",
      tenantId: "meal_313", locationId: "luton" };
    expect(authoriseAgentTool(target, owned).scope).toBe("customer_status");
    expect(authoriseAgentTool({ ...target, orderId: "other" }, owned).allowed).toBe(false);
    expect(authoriseAgentTool({ ...target, tenantId: "other_tenant" }, owned).allowed).toBe(false);
    expect(authoriseAgentTool(target, context()).allowed).toBe(false);
  });
  test("staff aggregate analytics need explicit tenant, location and permissions", () => {
    const staff = context({
      role: "staff", tenantId: "meal_313", permissions: ["analytics.read"],
    });
    const request = { tool: "ops.aggregate_analytics", tenantId: "meal_313", locationId: "luton" };
    expect(authoriseAgentTool(request, staff).scope).toBe("aggregate_only");
    expect(authoriseAgentTool(request, context({ ...staff, permissions: [] })).allowed).toBe(false);
    expect(authoriseAgentTool({ ...request, orderId: "ord_123" }, staff).allowed).toBe(false);
  });
  test("reject extra arguments that could smuggle PII or provider credentials", () => {
    expect(authoriseAgentTool({
      tool: "menu.public_catalogue", customerPhone: "secret",
    } as unknown as Parameters<typeof authoriseAgentTool>[0], context()).reason).toBe("invalid_request");
    expect(authoriseAgentTool({
      tool: "menu.public_catalogue", tenantId: "private_tenant",
    }, context()).allowed).toBe(false);
  });
});
