import { describe, expect, test } from "bun:test";
import {
  COURIER_PROVIDERS, collectCourierQuotes, chooseCheapestCourier,
  type CourierProviderSetting, type CourierQuoteRequest,
} from "../src/lib/mealdeck-courier-orchestration";
import type { DeliveryQuote } from "../src/lib/mealdeck-delivery-selection";
import type { CourierBookingContext } from "../src/lib/mealdeck-courier-booking-guard";

const now = "2026-11-09T19:00:00Z";
const request: CourierQuoteRequest = {
  tenantId: "tenant_1", locationId: "luton_1", orderId: "order_1",
  currency: "GBP", requestedAt: now, maximumDeliveryMinutes: 90,
};
const context: CourierBookingContext = {
  tenantId: "tenant_1", locationId: "luton_1", orderId: "order_1",
  currency: "GBP", fulfilment: "delivery", paymentStatus: "paid",
  allKitchenStationsReady: true, alreadyBooked: false,
  existingBookingRequest: false, maximumDeliveryMinutes: 90,
};
function quote(provider: DeliveryQuote["provider"], amountPence: number): DeliveryQuote {
  return { provider, quoteId: "quote_" + provider, amountPence, currency: "GBP",
    estimatedMinutes: 35, serviceable: true, expiresAt: "2026-11-09T19:10:00Z" };
}
const enabled = (provider: CourierProviderSetting["provider"], connected = true) => ({
  provider, enabled: true, connected,
});

describe("MealDeck cheapest eligible courier routing", () => {
  test("all five services are supported but none is implicitly enabled", async () => {
    expect(COURIER_PROVIDERS).toEqual([
      "own_fleet", "uber_direct", "deliveroo_express", "just_eat_go", "stuart",
    ]);
    let calls = 0;
    const results = await collectCourierQuotes(request, [], {
      uber_direct: async () => { calls++; return quote("uber_direct", 100); },
    });
    expect(calls).toBe(0);
    expect(results.map((r) => r.status)).toEqual(Array(5).fill("disabled"));
  });

  test("chooses the cheapest CURRENT GBP quote among enabled connected services", async () => {
    const settings = [
      enabled("own_fleet"), enabled("uber_direct"), enabled("deliveroo_express"),
      enabled("just_eat_go"), enabled("stuart"),
    ];
    const adapters = {
      own_fleet: async () => quote("own_fleet", 630),
      uber_direct: async () => quote("uber_direct", 490),
      deliveroo_express: async () => quote("deliveroo_express", 460),
      just_eat_go: async () => quote("just_eat_go", 395),
      stuart: async () => quote("stuart", 510),
    };
    const result = await chooseCheapestCourier(context, request, settings, adapters);
    expect(result.selected?.provider).toBe("just_eat_go");
    expect(result.selected?.amountPence).toBe(395);
    expect(result.bookingIntent?.idempotencyKey).toBe("courier:tenant_1:luton_1:order_1");
    expect(result.results.filter((r) => r.status === "quoted")).toHaveLength(5);
  });

  test("a switched-off provider is never queried or selected even if cheap", async () => {
    let calls = 0;
    const result = await chooseCheapestCourier(
      context, request,
      [enabled("uber_direct"), {provider: "stuart" as const, enabled: false, connected: true}],
      {
        uber_direct: async () => quote("uber_direct", 700),
        stuart: async () => { calls++; return quote("stuart", 1); },
      },
    );
    expect(calls).toBe(0);
    expect(result.selected?.provider).toBe("uber_direct");
  });

  test("missing credentials/adapters are not serviceability or price evidence", async () => {
    const result = await chooseCheapestCourier(
      context, request, [enabled("uber_direct"), enabled("own_fleet", false)], {},
    );
    expect(result.selected).toBeNull();
    expect(result.results.find(r => r.provider === "uber_direct")?.status).toBe("not_connected");
    expect(result.results.find(r => r.provider === "own_fleet")?.status).toBe("not_connected");
  });

  test("untrusted, expired, mismatched and late quotes fail closed", async () => {
    const result = await collectCourierQuotes(
      request,
      COURIER_PROVIDERS.map(provider => enabled(provider)),
      {
        own_fleet: async () => ({...quote("own_fleet", -1)}),
        uber_direct: async () => quote("stuart", 1),
        deliveroo_express: async () => ({...quote("deliveroo_express", 1), expiresAt: now}),
        just_eat_go: async () => ({...quote("just_eat_go", 1), currency: "USD"}),
        stuart: async () => ({...quote("stuart", 1), estimatedMinutes: 999}),
      },
    );
    expect(result.every(r => r.status === "invalid_quote")).toBe(true);
  });

  test("only paid, fully prepared orders with no existing booking may be quoted", async () => {
    let calls = 0;
    const adapters = {
      own_fleet: async () => { calls++; return quote("own_fleet", 350); },
    };
    for (const ctx of [
      {...context, paymentStatus: "pending" as const},
      {...context, allKitchenStationsReady: false},
      {...context, fulfilment: "pickup" as const},
      {...context, alreadyBooked: true},
      {...context, existingBookingRequest: true},
    ]) {
      const result = await chooseCheapestCourier(ctx, request, [enabled("own_fleet")], adapters);
      expect(result.selected).toBeNull();
    }
    expect(calls).toBe(0);
  });

  test("provider failure doesn't hide other quotes or cause fallback booking", async () => {
    const result = await chooseCheapestCourier(context, request,
      [enabled("own_fleet"), enabled("uber_direct")], {
        own_fleet: async () => quote("own_fleet", 450),
        uber_direct: async () => { throw new Error("provider down"); },
      });
    expect(result.selected?.provider).toBe("own_fleet");
    expect(result.results.find(r => r.provider === "uber_direct")?.status).toBe("unavailable");
  });

  test("times out stalled provider quotes without a false availability claim", async () => {
    const results = await collectCourierQuotes(request, [enabled("stuart")], {
      stuart: async () => new Promise<DeliveryQuote>(() => {}),
    }, 120);
    expect(results.find(r => r.provider === "stuart")?.status).toBe("unavailable");
  });
});
