import { describe, expect, test } from "bun:test";
import {
  checkOwnDriverArea,
  normaliseUkPostcode,
  ownDriverShortfallPence,
  parseOwnDriverAddress,
  postcodeDistanceMetres,
  OwnDriverInvalidPostcode,
  OwnDriverPostcodeUnavailable,
} from "../src/lib/mealdeck-own-driver-delivery";

const coords = { latitude: 51.893, longitude: -0.459 };
const fetcher = ((url: string) => {
  const code = url.split("/").at(-1);
  return Promise.resolve(
    Response.json({
      status: 200,
      result: {
        postcode: code === "LU48NU" ? "LU4 8NU" : "LU4 8NR",
        ...coords,
        longitude: code === "LU48NU" ? coords.longitude : coords.longitude + 0.001,
      },
    }),
  );
}) as typeof fetch;

describe("MealDeck own-driver delivery safeguards", () => {
  test("normalises UK postcode and rejects injection / incomplete postcodes", () => {
    expect(normaliseUkPostcode("lu48nu")).toBe("LU4 8NU");
    expect(normaliseUkPostcode(" lu4 8nu ")).toBe("LU4 8NU");
    expect(normaliseUkPostcode("not a postcode")).toBeNull();
    expect(normaliseUkPostcode("LU4<script>")).toBeNull();
  });
  test("accepts a street-level address and refuses extra unexpected client properties", () => {
    expect(
      parseOwnDriverAddress({
        postcode: "lu48nu",
        doorNumber: " 12A ",
        roadName: " High Street ",
        addressLine2: "Flat 2",
      }),
    ).toEqual({
      postcode: "LU4 8NU",
      doorNumber: "12A",
      roadName: "High Street",
      addressLine2: "Flat 2",
    });
    expect(
      parseOwnDriverAddress({
        postcode: "LU4 8NU",
        doorNumber: "12",
        roadName: "Main Street",
        feePence: 0,
      }),
    ).toBeNull();
    expect(
      parseOwnDriverAddress({ postcode: "LU4 8NU", doorNumber: "12", roadName: "X" }),
    ).toBeNull();
    expect(
      parseOwnDriverAddress({ postcode: "LU4 8NU", doorNumber: "12", roadName: "Road\u202e" }),
    ).toBeNull();
  });
  test("£15 minimum uses payable amount not original price", () => {
    expect(ownDriverShortfallPence(1499)).toBe(1);
    expect(ownDriverShortfallPence(999)).toBe(501);
    expect(ownDriverShortfallPence(1500)).toBe(0);
    expect(ownDriverShortfallPence(2000)).toBe(0);
    expect(ownDriverShortfallPence(-1)).toBeNull();
  });
  test("3 km radius has a precise boundary", () => {
    expect(postcodeDistanceMetres(coords, coords)).toBe(0);
    expect(
      postcodeDistanceMetres(coords, { ...coords, latitude: coords.latitude + 0.02 }),
    ).toBeGreaterThan(2000);
    expect(
      postcodeDistanceMetres(coords, { ...coords, latitude: coords.latitude + 0.04 }),
    ).toBeGreaterThan(3000);
  });
  test("looks up both postcodes server side and checks independently", async () => {
    const r = await checkOwnDriverArea("LU4 8NR", fetcher);
    expect(r.postcode).toBe("LU4 8NR");
    expect(r.eligible).toBe(true);
    expect(r.distanceMetres).toBeGreaterThan(0);
    await expect(checkOwnDriverArea("not valid", fetcher)).rejects.toBeInstanceOf(
      OwnDriverInvalidPostcode,
    );
  });
  test("geocoder failure denies delivery rather than approving any postcode", async () => {
    const bad = (async () => Response.json({ status: 500 }, { status: 500 })) as typeof fetch;
    await expect(checkOwnDriverArea("LU4 8ZX", bad)).rejects.toBeInstanceOf(
      OwnDriverPostcodeUnavailable,
    );
  });
  test("uses an independent fallback postcode service when Postcodes.io is down", async () => {
    const requested: string[] = [];
    const backup = (async (url: string) => {
      requested.push(url);
      if (url.startsWith("https://api.postcodes.io/")) {
        return Response.json({ status: 503 }, { status: 503 });
      }
      const code = url.split("/").at(-1);
      return Response.json({
        status: "match",
        match_type: "unit_postcode",
        data: {
          postcode: code === "LU48NU" ? "LU4 8NU" : "LU4 8ZX",
          status: "live",
          latitude: "51.893",
          longitude: code === "LU48NU" ? "-0.459" : "-0.458",
        },
      });
    }) as typeof fetch;
    const result = await checkOwnDriverArea("lu4 8zx", backup);
    expect(result.eligible).toBe(true);
    expect(requested.filter((url) => url.startsWith("https://api.getthedata.com/"))).toHaveLength(1);
  });

  test("rejects a mismatched fallback response, not an unverified delivery", async () => {
    const mismatched = (async (url: string) => {
      if (url.startsWith("https://api.postcodes.io/")) {
        return Response.json({ status: 503 }, { status: 503 });
      }
      return Response.json({
        status: "match",
        data: { postcode: "SW1A 1AA", status: "live", latitude: "51.5", longitude: "-0.1" },
      });
    }) as typeof fetch;
    await expect(checkOwnDriverArea("LU4 8ZX", mismatched)).rejects.toBeInstanceOf(
      OwnDriverPostcodeUnavailable,
    );
  });

  test("a source-verified exact Luton postcode remains serviceable during full provider outage", async () => {
    const unavailable = (async () => {
      throw new Error("outbound network temporarily unavailable");
    }) as typeof fetch;
    const area = await checkOwnDriverArea("LU1 1BU", unavailable);
    expect(area.postcode).toBe("LU1 1BU");
    expect(area.eligible).toBe(true);
    // Two separately sourced live postcode centroids ~2.03 km apart.
    expect(area.distanceMetres).toBeGreaterThan(2000);
    expect(area.distanceMetres).toBeLessThan(2100);
  });

  test("offline continuity never approves other LU1 postcodes by prefix", async () => {
    const unavailable = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    await expect(checkOwnDriverArea("LU1 1BC", unavailable)).rejects.toBeInstanceOf(
      OwnDriverPostcodeUnavailable,
    );
  });

  test("known launch postcode remains available without any provider requests", async () => {
    let calls = 0;
    const unreachable = (async () => {
      calls += 1;
      throw new Error("network unavailable");
    }) as typeof fetch;
    const origin = await checkOwnDriverArea("LU4 8NU", unreachable);
    const destination = await checkOwnDriverArea("LU1 1BU", unreachable);
    expect(origin.distanceMetres).toBe(0);
    expect(destination.eligible).toBe(true);
    expect(calls).toBe(0);
  });

  test("local directory checks real LU postcodes inside and outside 3 km without internet", async () => {
    let networkCalls = 0;
    const disconnected = (async () => {
      networkCalls += 1;
      throw new Error("network disconnected");
    }) as typeof fetch;
    for (const postcode of ["LU1 1AA", "LU3 1AA", "LU1 5AA"]) {
      const area = await checkOwnDriverArea(postcode, disconnected);
      expect(area.postcode).toBe(postcode);
      expect(area.eligible).toBe(true);
      expect(area.distanceMetres).toBeLessThanOrEqual(3000);
    }
    for (const postcode of ["LU2 0AA", "LU5 4AA"]) {
      const area = await checkOwnDriverArea(postcode, disconnected);
      expect(area.eligible).toBe(false);
      expect(area.distanceMetres).toBeGreaterThan(3000);
    }
    expect(networkCalls).toBe(0);
  });

  test("local directory never guesses postcode membership from LU prefix", async () => {
    const down = (async () => {
      throw new Error("providers unavailable");
    }) as typeof fetch;
    await expect(checkOwnDriverArea("LU4 8ZX", down)).rejects.toBeInstanceOf(
      OwnDriverPostcodeUnavailable,
    );
  });

  test("unknown UK postcode is rejected when both services confirm it does not exist", async () => {
    const missing = (async (url: string) =>
      url.startsWith("https://api.postcodes.io/")
        ? Response.json({ status: 404 }, { status: 404 })
        : Response.json({ status: "no_match", data: null })) as typeof fetch;
    await expect(checkOwnDriverArea("LU9 9ZZ", missing)).rejects.toBeInstanceOf(
      OwnDriverInvalidPostcode,
    );
  });

});
