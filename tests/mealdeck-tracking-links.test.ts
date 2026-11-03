import { describe, expect, test } from "bun:test";
import { safeCourierTrackingUrl } from "../src/lib/mealdeck-tracking-links";

const approved = "tracking.example.test,parcel.example.test";

describe("trusted external courier tracking links", () => {
  test("accepts only explicitly approved HTTPS hostnames", () => {
    expect(safeCourierTrackingUrl("https://tracking.example.test/order/abc", approved))
      .toBe("https://tracking.example.test/order/abc");
    expect(safeCourierTrackingUrl("https://status.tracking.example.test/abc", approved))
      .toBe("https://status.tracking.example.test/abc");
  });

  test("fails closed when no provider hosts have been approved", () => {
    expect(safeCourierTrackingUrl("https://tracking.example.test/a", undefined)).toBeNull();
    expect(safeCourierTrackingUrl("https://tracking.example.test/a", "")).toBeNull();
  });

  test("rejects lookalike or unapproved domains", () => {
    expect(safeCourierTrackingUrl("https://tracking.example.test.evil.test/abc", approved)).toBeNull();
    expect(safeCourierTrackingUrl("https://nottracking.example.test/abc", approved)).toBeNull();
    expect(safeCourierTrackingUrl("https://evil.test/abc", approved)).toBeNull();
  });

  test("rejects unsafe protocols and embedded credentials", () => {
    for (const input of [
      "javascript:alert(1)", "data:text/html,hello",
      "http://tracking.example.test/order",
      "https://user:password@tracking.example.test/order",
      "//tracking.example.test/order",
    ]) expect(safeCourierTrackingUrl(input, approved)).toBeNull();
  });

  test("rejects malformed and internal network destinations", () => {
    expect(safeCourierTrackingUrl("https://127.0.0.1/x", "127.0.0.1")).toBeNull();
    expect(safeCourierTrackingUrl("https://localhost/x", "localhost")).toBeNull();
    expect(safeCourierTrackingUrl("https://tracking.example.test:444/x", approved)).toBeNull();
    expect(safeCourierTrackingUrl("https://tracking.example.test\\@evil.test/x", approved)).toBeNull();
    expect(safeCourierTrackingUrl("not-a-url", approved)).toBeNull();
  });

  test("drops fragments while retaining legitimate provider path and query", () => {
    expect(safeCourierTrackingUrl("https://tracking.example.test/parcel?ref=123#secret", approved))
      .toBe("https://tracking.example.test/parcel?ref=123");
  });

  test("rejects oversized links and invalid configuration entries", () => {
    expect(safeCourierTrackingUrl("https://tracking.example.test/" + "a".repeat(2100), approved)).toBeNull();
    expect(safeCourierTrackingUrl("https://tracking.example.test/x", "https://tracking.example.test"))
      .toBeNull();
    expect(safeCourierTrackingUrl("https://tracking.example.test/x", "*.example.test"))
      .toBeNull();
  });
});
