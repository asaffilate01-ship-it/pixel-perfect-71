import { describe, expect, test } from "bun:test";
import {
  checkOwnDriverArea,
  normaliseUkPostcode,
  ownDriverShortfallPence,
  parseOwnDriverAddress,
  postcodeDistanceMetres,
  OwnDriverInvalidPostcode,
  OWN_DRIVER_RADIUS_METRES,
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
  test("4 km radius has a precise boundary", () => {
    expect(OWN_DRIVER_RADIUS_METRES).toBe(4000);
    expect(postcodeDistanceMetres(coords, coords)).toBe(0);
    expect(
      postcodeDistanceMetres(coords, { ...coords, latitude: coords.latitude + 0.02 }),
    ).toBeGreaterThan(2000);
    expect(
      postcodeDistanceMetres(coords, { ...coords, latitude: coords.latitude + 0.04 }),
    ).toBeGreaterThan(4000);
  });
  const offline = (async () => {
    throw new Error("outbound network unavailable");
  }) as typeof fetch;

  test("verified Luton postcodes resolve from the local store with no network", async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      throw new Error("network unavailable");
    }) as typeof fetch;
    const base = await checkOwnDriverArea("lu48nu", counting);
    expect(base).toMatchObject({ postcode: "LU4 8NU", eligible: true, distanceMetres: 0 });
    // 14 Guardian Way: OS grid offset (+1163, -1670) from LU4 8NU.
    const guardian = await checkOwnDriverArea("LU1 1BU", counting);
    expect(guardian).toMatchObject({ eligible: true, distanceMetres: 2035, source: "local_store" });
    // Reported live failure: LU2 7EZ is 2,506 m away and must now pass.
    const north = await checkOwnDriverArea("LU2 7EZ", counting);
    expect(north).toMatchObject({ eligible: true, distanceMetres: 2506 });
    // Previous 3 km boundary no longer excludes 3.3 km delivery.
    const south = await checkOwnDriverArea("LU1 5QD", counting);
    expect(south).toMatchObject({ eligible: true, distanceMetres: 3317, source: "local_store" });
    const newLuton = await checkOwnDriverArea("LU4 9GF", counting);
    expect(newLuton).toMatchObject({ eligible: true, distanceMetres: 1210 });
    expect(calls).toBe(0);
  });

  test("4 km boundary accepts 3,999 m and refuses 4,003 m from the verified local store", async () => {
    const inside = await checkOwnDriverArea("LU5 5TB", offline);
    expect(inside).toMatchObject({ eligible: true, distanceMetres: 3999, source: "local_store" });
    const outside = await checkOwnDriverArea("LU2 9ER", offline);
    expect(outside).toMatchObject({ eligible: false, distanceMetres: 4003, source: "local_store" });
    const newlyEligible = await checkOwnDriverArea("LU4 0PR", offline);
    expect(newlyEligible).toMatchObject({ eligible: true, distanceMetres: 3002 });
  });

  test("a real LU postcode at 3,954 m now qualifies but a farther postcode does not", async () => {
    const close = await checkOwnDriverArea("LU2 9BL", offline);
    expect(close).toMatchObject({ eligible: true, distanceMetres: 3954, source: "local_store" });
    const far = await checkOwnDriverArea("LU2 9ER", offline);
    expect(far.eligible).toBe(false);
  });

  test("non-existent LU postcode with lookup down is never approved", async () => {
    const area = await checkOwnDriverArea("LU1 1BC", offline);
    expect(area.eligible).toBe(false);
    expect(area.distanceMetres).toBeNull();
  });

  test("invalid format is rejected", async () => {
    await expect(checkOwnDriverArea("not valid", offline)).rejects.toBeInstanceOf(
      OwnDriverInvalidPostcode,
    );
  });

  test("postcodes outside the local store use an exact remote lookup", async () => {
    const remote = (async (url: string) =>
      Response.json({
        status: 200,
        result: {
          postcode: url.endsWith("SW1A1AA") ? "SW1A 1AA" : "X",
          latitude: 51.501,
          longitude: -0.1416,
        },
      })) as typeof fetch;
    const area = await checkOwnDriverArea("SW1A 1AA", remote);
    expect(area.source).toBe("remote_lookup");
    expect(area.eligible).toBe(false);
    expect(area.distanceMetres).toBeGreaterThan(40_000);
  });

  test("remote failure for an outside postcode refuses delivery rather than approving", async () => {
    const bad = (async () => Response.json({ status: 500 }, { status: 500 })) as typeof fetch;
    const area = await checkOwnDriverArea("MK9 3AA", bad);
    expect(area).toMatchObject({ eligible: false, distanceMetres: null });
  });

  test("uses an independent fallback postcode service when Postcodes.io is down", async () => {
    const requested: string[] = [];
    const backup = (async (url: string, init?: RequestInit) => {
      requested.push(url);
      expect(init?.redirect).toBe("manual");
      if (url.startsWith("https://api.postcodes.io/")) {
        return Response.json({ status: 503 }, { status: 503 });
      }
      return Response.json({
        status: "match",
        data: { postcode: "MK9 3AA", status: "live", latitude: "52.04", longitude: "-0.76" },
      });
    }) as typeof fetch;
    const result = await checkOwnDriverArea("mk9 3aa", backup);
    expect(result.eligible).toBe(false);
    expect(result.source).toBe("remote_lookup");
    expect(requested.filter((url) => url.startsWith("https://api.getthedata.com/"))).toHaveLength(1);
  });

  test("a mismatched fallback response is never treated as a verified location", async () => {
    const mismatched = (async (url: string) => {
      if (url.startsWith("https://api.postcodes.io/")) {
        return Response.json({ status: 503 }, { status: 503 });
      }
      return Response.json({
        status: "match",
        data: { postcode: "SW1A 1AA", status: "live", latitude: "51.5", longitude: "-0.1" },
      });
    }) as typeof fetch;
    const area = await checkOwnDriverArea("MK9 3AA", mismatched);
    expect(area).toMatchObject({ eligible: false, distanceMetres: null });
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
