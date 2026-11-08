import { z } from "zod";

/** Luton own-driver launch rules. Distances use postcode centroids, not road routes. */
export const OWN_DRIVER_BASE_POSTCODE = "LU4 8NU";
export const OWN_DRIVER_RADIUS_METRES = 3_000;
export const OWN_DRIVER_MINIMUM_PENCE = 1_500;
export const OWN_DRIVER_MAX_MINUTES = 60;

const postcodePattern = /^(?:[A-Z]{1,2}[0-9][A-Z0-9]?)\s*[0-9][A-Z]{2}$/;

export function normaliseUkPostcode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 20) return null;
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!postcodePattern.test(compact)) return null;
  return compact.slice(0, -3) + " " + compact.slice(-3);
}

const addressInput = z
  .object({
    postcode: z.string().max(20),
    doorNumber: z.string().trim().min(1).max(40),
    roadName: z.string().trim().min(2).max(120),
    addressLine2: z.string().trim().max(120).optional(),
  })
  .strict();

export type OwnDriverAddress = {
  postcode: string;
  doorNumber: string;
  roadName: string;
  addressLine2: string;
};

// eslint-disable-next-line no-control-regex -- Reject control characters in customer addresses.
const unsafeAddressChars = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/u;

export function parseOwnDriverAddress(value: unknown): OwnDriverAddress | null {
  const parsed = addressInput.safeParse(value);
  if (!parsed.success) return null;
  const postcode = normaliseUkPostcode(parsed.data.postcode);
  const { doorNumber, roadName } = parsed.data;
  const addressLine2 = parsed.data.addressLine2 ?? "";
  if (
    !postcode ||
    [doorNumber, roadName, addressLine2].some((part) => unsafeAddressChars.test(part))
  )
    return null;
  return { postcode, doorNumber, roadName, addressLine2 };
}

/** Server-calculated amount AFTER all promotions, never the menu subtotal. */
export function ownDriverShortfallPence(payablePence: number): number | null {
  if (!Number.isSafeInteger(payablePence) || payablePence < 0) return null;
  return Math.max(0, OWN_DRIVER_MINIMUM_PENCE - payablePence);
}

type Coordinates = { latitude: number; longitude: number };
export type OwnDriverArea = {
  eligible: boolean;
  postcode: string;
  distanceMetres: number;
  origin: Coordinates;
  destination: Coordinates;
};

function validCoordinates(lat: unknown, lon: unknown): Coordinates | null {
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  return { latitude: lat, longitude: lon };
}

/** Haversine in metres: 3km straight-line radius from LU4 8NU. */
export function postcodeDistanceMetres(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const deltaLat = (b.latitude - a.latitude) * rad;
  const deltaLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(deltaLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h))));
}

export class OwnDriverPostcodeUnavailable extends Error {
  constructor() {
    super("We couldn't check delivery coverage just now. Try again, or choose collection.");
  }
}
export class OwnDriverInvalidPostcode extends Error {
  constructor() {
    super("Enter a valid UK postcode to check delivery.");
  }
}

async function lookupPostcode(
  postcode: string,
  fetcher: typeof fetch,
): Promise<Coordinates | null> {
  let response: Response;
  try {
    response = await fetcher(
      "https://api.postcodes.io/postcodes/" + encodeURIComponent(postcode.replace(/\s/g, "")),
      {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(6_000),
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );
  } catch {
    throw new OwnDriverPostcodeUnavailable();
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new OwnDriverPostcodeUnavailable();
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new OwnDriverPostcodeUnavailable();
  }
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new OwnDriverPostcodeUnavailable();
  const result = (json as Record<string, unknown>)["result"];
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new OwnDriverPostcodeUnavailable();
  const data = result as Record<string, unknown>;
  if (normaliseUkPostcode(data["postcode"]) !== postcode) throw new OwnDriverPostcodeUnavailable();
  return (
    validCoordinates(data["latitude"], data["longitude"]) ??
    (() => {
      throw new OwnDriverPostcodeUnavailable();
    })()
  );
}

/** Never trust a browser-provided radius result or coordinates. Checked again at quote time. */
export async function checkOwnDriverArea(
  raw: unknown,
  fetcher: typeof fetch = fetch,
): Promise<OwnDriverArea> {
  const postcode = normaliseUkPostcode(raw);
  if (!postcode) throw new OwnDriverInvalidPostcode();
  const [origin, destination] = await Promise.all([
    lookupPostcode(OWN_DRIVER_BASE_POSTCODE, fetcher),
    lookupPostcode(postcode, fetcher),
  ]);
  if (!origin) throw new OwnDriverPostcodeUnavailable();
  if (!destination) throw new OwnDriverInvalidPostcode();
  const distance = postcodeDistanceMetres(origin, destination);
  return {
    eligible: distance <= OWN_DRIVER_RADIUS_METRES,
    postcode,
    distanceMetres: Math.round(distance),
    origin,
    destination,
  };
}
