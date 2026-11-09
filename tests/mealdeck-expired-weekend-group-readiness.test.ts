import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { newGroupRoomsAreOpen } from "../src/lib/mealdeck-group-launch";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("MealDeck post-opening UI and group availability", () => {
  test("group admission start is server-timed, never an unrestricted client switch", () => {
    expect(newGroupRoomsAreOpen(Date.parse("2026-11-08T23:59:59Z"))).toBe(false);
    expect(newGroupRoomsAreOpen(Date.parse("2026-11-09T00:00:00Z"))).toBe(true);
    const server = read("src/lib/mealdeck-shared-payments.server.ts");
    expect(server).toContain('env["MEALDECK_SHARED_PAYMENTS_ENABLED"] === "true"');
    expect(server).toContain("readGroupLinkSecret(env) !== null");
    expect(server).toContain("status.available &&");
  });

  test("menus show no expired opening-weekend 30% promotion or unverified new-room promise", () => {
    const menu = read("src/components/menus/launch-menu-browser.tsx");
    expect(menu).not.toContain("<OpeningWeekendOffer");
    expect(menu).not.toContain("Opening offer: 30%");
    expect(menu).not.toContain("Group rooms open on Monday 9 November");
    expect(menu).not.toContain("groupOrderingOpen");
    expect(menu).toContain("Explore group ordering");
    expect(menu).toContain("Member benefits");
  });

  test("account and navigation no longer advertise the expired discount or unapproved double points", () => {
    const account = read("src/components/customer-account.tsx");
    const nav = read("src/components/menus/launch-menu-app-nav.tsx");
    const footer = read("src/components/site-footer.tsx");
    expect(account).not.toContain("30% off everything.");
    expect(account).not.toContain("inclusive for double loyalty points.");
    expect(nav).not.toContain("99p milk cake &amp; double points");
    expect(footer).not.toContain("November inclusive");
    expect(footer).toContain("Verified members earn loyalty points");
  });

  test("group room distinguishes loading and backend unavailable from launch-date messaging", () => {
    const group = read("src/components/group-order-room.tsx");
    expect(group).not.toContain("Group ordering · Starting 9 November");
    expect(group).not.toContain("Your next meal together starts on Monday.");
    expect(group).toContain("Group rooms not accepting new orders");
    expect(group).toContain("Checking group ordering availability");
    expect(group).toContain("capabilities?.message");
    expect(group).toContain("Check group room availability");
    expect(group).toContain("const newRoomsOpen = capabilities?.available === true;");
    expect(group).toContain("Check availability again");
    expect(group).not.toContain("Coming Monday");
    expect(group).not.toContain("New group rooms start on Monday 9 November.");
  });
});
