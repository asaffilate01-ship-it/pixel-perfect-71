import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DRIVER_GPS_MAX_FIX_AGE_MS,
  assessDriverGpsReadiness,
  type DriverGpsSample,
} from "../src/lib/mealdeck-driver-gps-readiness";
import { DriverGpsReadiness } from "../src/components/driver/driver-gps-readiness";

const time = Date.parse("2026-11-10T11:00:00Z");
const sample: DriverGpsSample = {
  coords: { latitude: 51.881, longitude: -0.45, accuracy: 24 },
  timestamp: time - 1_000,
};
const source = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("MealDeck Driver privacy-only GPS preflight", () => {
  test("accepts a recent accurate fix without returning or persisting coordinates", () => {
    const result = assessDriverGpsReadiness(sample, time);
    expect(result).toEqual({ status: "ready", accuracyMetres: 25 });
    expect(JSON.stringify(result)).not.toContain("51.881");
    expect(JSON.stringify(result)).not.toContain("-0.45");
    expect(result).not.toHaveProperty("latitude");
    expect(result).not.toHaveProperty("longitude");
  });

  test("rejects stale, implausibly future and untrustworthy coordinates", () => {
    expect(
      assessDriverGpsReadiness(
        { ...sample, timestamp: time - DRIVER_GPS_MAX_FIX_AGE_MS - 1 },
        time,
      ),
    ).toEqual({ status: "stale" });
    expect(
      assessDriverGpsReadiness({ ...sample, timestamp: time + 5_001 }, time),
    ).toEqual({ status: "stale" });
    expect(
      assessDriverGpsReadiness(
        { ...sample, coords: { ...sample.coords, latitude: 91 } },
        time,
      ),
    ).toEqual({ status: "invalid" });
    expect(
      assessDriverGpsReadiness(
        { ...sample, coords: { ...sample.coords, longitude: Number.NaN } },
        time,
      ),
    ).toEqual({ status: "invalid" });
  });

  test("requires strict accuracy before rounding and never promotes a weak fix", () => {
    expect(
      assessDriverGpsReadiness(
        { ...sample, coords: { ...sample.coords, accuracy: 100 } },
        time,
      ),
    ).toEqual({ status: "ready", accuracyMetres: 100 });
    expect(
      assessDriverGpsReadiness(
        { ...sample, coords: { ...sample.coords, accuracy: 100.01 } },
        time,
      ),
    ).toEqual({ status: "inaccurate", accuracyMetres: 105 });
    expect(
      assessDriverGpsReadiness(
        { ...sample, coords: { ...sample.coords, accuracy: -2 } },
        time,
      ),
    ).toEqual({ status: "invalid" });
  });

  test("is one click, foreground-only and has no ongoing tracking transport", () => {
    const ui = source("src/components/driver/driver-gps-readiness.tsx");
    const driver = source("src/components/driver/driver-workspace.tsx");
    expect(ui).toContain("navigator.geolocation.getCurrentPosition(");
    expect(ui).toContain("maximumAge: 0");
    expect(ui).toContain('document.visibilityState !== "visible"');
    expect(ui).toContain("disabled={!canCheck || busy}");
    expect(ui).not.toContain("navigator.geolocation.watchPosition(");
    expect(ui).not.toContain("fetch(");
    expect(ui).not.toContain("driverRpc(");
    expect(ui).not.toContain("localStorage");
    expect(ui).not.toContain("sessionStorage");
    expect(driver).toContain("portal && <DriverGpsReadiness");
    expect(driver).toContain("onShift={portal.onShift}");
  });

  test("renders an honest disabled state when an approved driver is off shift", () => {
    const markup = renderToStaticMarkup(
      createElement(DriverGpsReadiness, {
        userId: "verified-driver",
        onShift: false,
        online: true,
      }),
    );
    expect(markup).toContain("Check GPS readiness");
    expect(markup).toContain("Start your shift");
    expect(markup).toContain("Customer map tracking is not yet active");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("51.881");
  });
});
