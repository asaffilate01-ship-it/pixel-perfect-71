/**
 * Foreground-only driver GPS beta. The browser never persists a coordinate,
 * estimates an ETA, or submits a location without explicit per-order consent.
 * The private PostgreSQL RPC independently verifies identity and delivery.
 */
export const DRIVER_LIVE_FIX_MAX_AGE_MS = 25_000;
export const DRIVER_LIVE_FIX_MAX_ACCURACY_METRES = 100;
export const DRIVER_CUSTOMER_FIX_MAX_AGE_MS = 30_000;

type GpsFix = Readonly<{
  coords: Readonly<{ latitude: number; longitude: number; accuracy: number }>;
  timestamp: number;
}>;
export type VerifiedDriverFix = Readonly<{
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  fixedAt: string;
}>;

/** A client preflight only. The database is the real location authority. */
export function validatedDriverLiveFix(
  sample: GpsFix,
  now = Date.now(),
): VerifiedDriverFix | null {
  if (
    !sample?.coords || !Number.isFinite(now) ||
    !Number.isFinite(sample.timestamp) ||
    sample.timestamp < now - DRIVER_LIVE_FIX_MAX_AGE_MS ||
    sample.timestamp > now + 5_000 ||
    !Number.isFinite(sample.coords.latitude) ||
    !Number.isFinite(sample.coords.longitude) ||
    sample.coords.latitude < 51.8 || sample.coords.latitude > 52.0 ||
    sample.coords.longitude < -0.65 || sample.coords.longitude > -0.30 ||
    !Number.isFinite(sample.coords.accuracy) ||
    sample.coords.accuracy <= 0 ||
    sample.coords.accuracy > DRIVER_LIVE_FIX_MAX_ACCURACY_METRES
  ) return null;
  return {
    latitude: sample.coords.latitude,
    longitude: sample.coords.longitude,
    accuracyMetres: Math.ceil(sample.coords.accuracy),
    fixedAt: new Date(sample.timestamp).toISOString(),
  };
}

export type CustomerDriverPosition = Readonly<{
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  observedAt: string;
}>;

/** Parse *only* a current, private, authenticated member-order projection. */
export function parseCustomerDriverPosition(
  value: unknown,
  now = Date.now(),
): CustomerDriverPosition | null {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    !Number.isFinite(now)) return null;
  const obj = value as Record<string, unknown>;
  if (obj["available"] !== true || Object.keys(obj).some(key =>
    !["available", "latitude", "longitude", "accuracyMetres", "observedAt"].includes(key)
  )) return null;
  const lat = obj["latitude"], lon = obj["longitude"],
    accuracy = obj["accuracyMetres"], at = obj["observedAt"];
  if (typeof lat !== "number" || !Number.isFinite(lat) ||
    lat < 51.8 || lat > 52.0 || typeof lon !== "number" ||
    !Number.isFinite(lon) || lon < -0.65 || lon > -0.30 ||
    !Number.isSafeInteger(accuracy) || (accuracy as number) < 1 ||
    (accuracy as number) > 100 || typeof at !== "string" ||
    at.length > 45 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(at) ||
    !Number.isFinite(Date.parse(at))) return null;
  const age = now - Date.parse(at);
  if (age < -5_000 || age > DRIVER_CUSTOMER_FIX_MAX_AGE_MS) return null;
  return { latitude: lat, longitude: lon, accuracyMetres: accuracy as number, observedAt: at };
}
