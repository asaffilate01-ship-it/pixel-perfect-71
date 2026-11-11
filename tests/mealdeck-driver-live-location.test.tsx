import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DRIVER_CUSTOMER_FIX_MAX_AGE_MS,
  DRIVER_LIVE_FIX_MAX_AGE_MS,
  parseCustomerDriverPosition,
  validatedDriverLiveFix,
} from "../src/lib/mealdeck-driver-live-location";
import { DriverLiveLocation } from "../src/components/driver/driver-live-location";
import { CustomerDriverPosition } from "../src/components/customer-driver-position";

const source = (name: string) =>
  readFileSync(new URL("../" + name, import.meta.url), "utf8");
const now = Date.parse("2026-11-11T11:30:00Z");
const gps = {
  coords: { latitude: 51.8973, longitude: -0.4461, accuracy: 18.5 },
  timestamp: now - 1_000,
};

describe("opt-in foreground driver GPS and member-only projection", () => {
  test("only recent accurate Luton fixes become an eligible server request", () => {
    const good = validatedDriverLiveFix(gps, now);
    expect(good).toEqual({
      latitude: 51.8973, longitude: -0.4461,
      accuracyMetres: 19, fixedAt: "2026-11-11T11:29:59.000Z",
    });
    for (const bad of [
      { ...gps, timestamp: now - DRIVER_LIVE_FIX_MAX_AGE_MS - 1 },
      { ...gps, timestamp: now + 5_001 },
      { ...gps, coords: { ...gps.coords, accuracy: 100.1 } },
      { ...gps, coords: { ...gps.coords, latitude: 52.1 } },
      { ...gps, coords: { ...gps.coords, longitude: -0.2 } },
      { ...gps, coords: { ...gps.coords, latitude: Number.NaN } },
      { ...gps, coords: { ...gps.coords, accuracy: 0 } },
    ]) expect(validatedDriverLiveFix(bad, now)).toBeNull();
  });

  test("accept only current strict, private member position, no arbitrary secrets", () => {
    const result = {
      available: true, latitude: 51.8973, longitude: -0.4461,
      accuracyMetres: 19, observedAt: "2026-11-11T11:29:59Z",
    };
    expect(parseCustomerDriverPosition(result, now)).toEqual({
      latitude: 51.8973, longitude: -0.4461,
      accuracyMetres: 19, observedAt: result.observedAt,
    });
    expect(parseCustomerDriverPosition({ available: false }, now)).toBeNull();
    expect(parseCustomerDriverPosition({ ...result, driverPhone: "+447700900123" }, now)).toBeNull();
    expect(parseCustomerDriverPosition({ ...result, accuracyMetres: 120 }, now)).toBeNull();
    expect(parseCustomerDriverPosition({
      ...result, observedAt: new Date(now - DRIVER_CUSTOMER_FIX_MAX_AGE_MS - 1).toISOString(),
    }, now)).toBeNull();
    expect(parseCustomerDriverPosition({
      ...result, observedAt: new Date(now + 5_001).toISOString(),
    }, now)).toBeNull();
  });

  test("driver controls require a second opt-in; no background tracking or storage", () => {
    const ui = source("src/components/driver/driver-live-location.tsx");
    const workspace = source("src/components/driver/driver-workspace.tsx");
    expect(ui).toContain("mealdeck_driver_location_consent");
    expect(ui).toContain("mealdeck_driver_location_point");
    expect(ui).toContain("navigator.geolocation.watchPosition(");
    expect(ui).toContain("navigator.geolocation.clearWatch(");
    expect(ui).toContain('document.visibilityState === "hidden"');
    expect(ui).toContain('p_enabled: false');
    expect(ui).not.toContain("localStorage");
    expect(ui).not.toContain("sessionStorage");
    expect(ui).not.toContain("Notification.requestPermission");
    expect(ui).not.toContain("backgroundSync");
    expect(workspace).toContain('VITE_MEALDECK_DRIVER_LOCATION_BETA === "true"');
    expect(workspace).toContain('job.status === "collected" || job.status === "at_customer"');
    expect(workspace).toContain('job.driverStatus === "with_driver"');
    const html = renderToStaticMarkup(createElement(DriverLiveLocation, {
      orderId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      onShift: false, online: true,
    }));
    expect(html).toContain("Start sharing");
    expect(html).toContain("disabled");
    expect(html).toContain("foreground");
    expect(html).not.toContain("51.8973");
  });

  test("customer preview is account-only, short-lived and requires a user-clicked map link", () => {
    const account = source("src/components/customer-orders.tsx");
    const ui = source("src/components/customer-driver-position.tsx");
    const sql = source(
      "deploy/mealdeck/post-install-migrations/20261111113000_mealdeck_private_driver_location.sql",
    );
    expect(account).toContain('VITE_MEALDECK_DRIVER_LOCATION_BETA === "true"');
    expect(account).toContain('order.verifiedPaid && !order.held && !order.completedAt');
    expect(ui).toContain("mealdeck_customer_driver_position");
    expect(ui).toContain("google.com/maps/search/");
    expect(ui).toContain("Opening Google Maps shares this position with Google.");
    expect(ui).not.toContain("<iframe");
    expect(sql).toContain("customer_registration_authority(viewer)");
    expect(sql).toContain("o.customer_id=viewer and not o.guest_checkout");
    expect(sql).toContain("p.expires_at>clock_timestamp()");
    expect(sql).toContain("p.enabled and p.latitude is not null");
    expect(sql).toContain("driver_location_authorised(p_order,v.driver_id)");
    expect(sql).toContain("driver_location_points enable row level security");
    expect(sql).toContain("grant execute on function public.mealdeck_driver_location_consent");
    expect(sql).not.toMatch(/grant\s+select\s+on\s+mealdeck_private\.driver_location_points/i);
    expect(sql).toContain("clear_stale_driver_locations()");
    expect(sql).toContain("mealdeck-driver-location-retention");
    const markup = renderToStaticMarkup(createElement(CustomerDriverPosition, {
      orderId: "00000000-0000-4000-8000-000000000001",
    }));
    expect(markup).toContain("Checking the latest verified driver location");
    expect(markup).not.toContain("https://www.google.com/maps/search/");
  });
});
