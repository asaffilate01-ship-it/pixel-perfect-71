/**
 * Privacy-preserving, single-shot GPS readiness only. This module has no
 * network, background watch, storage or customer-tracking responsibility.
 * The actual coordinate must never be returned to the UI or logged.
 */
export const DRIVER_GPS_MAX_FIX_AGE_MS = 30_000;
export const DRIVER_GPS_MAX_ACCURACY_METRES = 100;

export type DriverGpsSample = Readonly<{
  coords: Readonly<{
    latitude: number;
    longitude: number;
    accuracy: number;
  }>;
  timestamp: number;
}>;

export type DriverGpsAssessment =
  | Readonly<{ status: "ready"; accuracyMetres: number }>
  | Readonly<{ status: "inaccurate"; accuracyMetres: number }>
  | Readonly<{ status: "stale" | "invalid" }>;

/** Validate a one-off browser geolocation reading without disclosing location. */
export function assessDriverGpsReadiness(
  sample: DriverGpsSample,
  now = Date.now(),
): DriverGpsAssessment {
  if (
    !sample ||
    !sample.coords ||
    !Number.isFinite(now) ||
    !Number.isFinite(sample.timestamp) ||
    !Number.isFinite(sample.coords.latitude) ||
    !Number.isFinite(sample.coords.longitude) ||
    !Number.isFinite(sample.coords.accuracy) ||
    Math.abs(sample.coords.latitude) > 90 ||
    Math.abs(sample.coords.longitude) > 180 ||
    sample.coords.accuracy <= 0
  ) {
    return { status: "invalid" };
  }
  const age = now - sample.timestamp;
  if (age < -5_000 || age > DRIVER_GPS_MAX_FIX_AGE_MS) {
    return { status: "stale" };
  }
  // Accuracy is approximate and rounded for display. The exact coordinates
  // never leave this local function.
  const accuracyMetres = Math.max(5, Math.ceil(sample.coords.accuracy / 5) * 5);
  return sample.coords.accuracy <= DRIVER_GPS_MAX_ACCURACY_METRES
    ? { status: "ready", accuracyMetres }
    : { status: "inaccurate", accuracyMetres };
}
