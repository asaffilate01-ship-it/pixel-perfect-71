import { describe, expect, test } from "bun:test";
import { verifyOwnDriverPayment } from "../src/lib/mealdeck-own-driver-payment.server";

const quote = { delivery: true, postcode: "LU4 8NR", totalPence: 1500 };
function postcodeFetch(outside = false): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const postcode = String(input).endsWith("LU48NU") ? "LU4 8NU" : "LU4 8NR";
    return Response.json({
      status: 200,
      result: {
        postcode,
        latitude: postcode === "LU4 8NU" || !outside ? 51.893 : 52.05,
        longitude: -0.459,
      },
    });
  }) as typeof fetch;
}
const neverRead = async (): Promise<Record<string, unknown>> => {
  throw new Error("Delivery lookup must not run");
};

describe("canonical own-driver payment admission", () => {
  test("collection and kerbside do not depend on the delivery extension or geocoder", async () => {
    for (const fulfilment of ["pickup", "curbside"]) {
      await verifyOwnDriverPayment({
        order: { fulfilment, totalPence: 500 },
        deliveryEnabled: false,
        readQuote: neverRead,
        fetcher: (async () => {
          throw new Error("No geocoder for pickup");
        }) as typeof fetch,
      });
    }
  });
  test("a previously prepared delivery cannot resume payment after delivery is disabled", async () => {
    await expect(
      verifyOwnDriverPayment({
        order: { fulfilment: "delivery", totalPence: 2000 },
        deliveryEnabled: false,
        readQuote: neverRead,
      }),
    ).rejects.toMatchObject({ code: "delivery_unavailable", status: 503 });
  });
  test("requires a bound canonical delivery quote with the exact prepared payable total", async () => {
    for (const invalid of [
      { ...quote, delivery: false },
      { ...quote, totalPence: 1600 },
    ]) {
      await expect(
        verifyOwnDriverPayment({
          order: { fulfilment: "delivery", totalPence: 1500 },
          deliveryEnabled: true,
          readQuote: async () => invalid,
          fetcher: postcodeFetch(),
        }),
      ).rejects.toMatchObject({ code: "delivery_quote_invalid" });
    }
  });
  test("£14.99 fails and £15.00 succeeds using the discounted payable amount", async () => {
    await expect(
      verifyOwnDriverPayment({
        order: { fulfilment: "delivery", totalPence: 1499 },
        deliveryEnabled: true,
        readQuote: async () => ({ ...quote, totalPence: 1499 }),
        fetcher: postcodeFetch(),
      }),
    ).rejects.toMatchObject({ code: "minimum_delivery_order" });
    await verifyOwnDriverPayment({
      order: { fulfilment: "delivery", totalPence: 1500 },
      deliveryEnabled: true,
      readQuote: async () => quote,
      fetcher: postcodeFetch(),
    });
  });
  test("rejects an outside postcode independently of any claimed distance", async () => {
    await expect(
      verifyOwnDriverPayment({
        order: { fulfilment: "delivery", totalPence: 1500 },
        deliveryEnabled: true,
        readQuote: async () => ({ ...quote, distanceMetres: 1 }),
        fetcher: postcodeFetch(true),
      }),
    ).rejects.toMatchObject({ code: "outside_delivery_area" });
  });
  test("geocoder failure for a postcode outside the local store blocks delivery payment", async () => {
    await expect(
      verifyOwnDriverPayment({
        order: { fulfilment: "delivery", totalPence: 1500 },
        deliveryEnabled: true,
        readQuote: async () => quote,
        fetcher: (async () => new Response("Unavailable", { status: 503 })) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "outside_delivery_area" });
  });
  test("unknown canonical fulfilment is not silently treated as collection", async () => {
    await expect(
      verifyOwnDriverPayment({
        order: { fulfilment: "invented", totalPence: 1500 },
        deliveryEnabled: true,
        readQuote: neverRead,
      }),
    ).rejects.toMatchObject({ code: "invalid_fulfilment" });
  });
});
