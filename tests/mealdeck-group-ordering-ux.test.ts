import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { canQuickAddLaunchItem } from "../src/lib/launch-menu-picks";
import type { LaunchMenuItem } from "../src/lib/launch-menu-catalogue";

const source = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const fixed: LaunchMenuItem = {
  id: "fixed-price-test",
  name: "Fixed-price test dish",
  description: "Fixed dish",
  pricePence: 500,
  optionGroupIds: [],
  sourceRefs: [],
};

describe("safe single-tap dishes in solo and group menus", () => {
  test("one tap is allowed only for an available fixed-price item with no choice references", () => {
    expect(canQuickAddLaunchItem(fixed)).toBe(true);
    expect(canQuickAddLaunchItem({ ...fixed, available: false })).toBe(false);
    expect(canQuickAddLaunchItem({ ...fixed, pricePence: null })).toBe(false);
    expect(canQuickAddLaunchItem({ ...fixed, pricePence: NaN })).toBe(false);
    expect(canQuickAddLaunchItem({ ...fixed, optionGroupIds: ["required-variant-not-yet-loaded"] })).toBe(false);
    expect(canQuickAddLaunchItem({ ...fixed, priceVariants: [{
      groupId: "portion", optionId: "large", label: "Large", selections: {}, pricePence: 700,
    }] })).toBe(false);
  });

  test("both solo and group ordering enforce the same quick-add safety rule", () => {
    expect(source("src/components/group-room-menu.tsx")).toContain(
      "if (!existing && canQuickAddLaunchItem(entry.item))",
    );
    expect(source("src/components/menus/launch-menu-browser.tsx")).toContain(
      "if (!existing && canQuickAddLaunchItem(entry.item))",
    );
    expect(source("src/components/group-room-menu.tsx")).toContain(
      "matchesLaunchMenuSearch(query, [",
    );
    expect(source("src/components/group-room-menu.tsx")).toContain(
      "Save before leaving.",
    );
  });

  test("an explicit save shortcut remains separate from paid-order finalisation", () => {
    const room = source("src/components/group-order-room.tsx");
    const menu = source("src/components/group-room-menu.tsx");
    const styles = source("src/styles.mealdeck-group-room.css");
    expect(room).toContain("unsaved={draft.dirty}");
    expect(room).toContain('id="group-order-save-choices-button"');
    expect(room).toContain("void saveChoices(true)");
    expect(room).toContain("reviewConfirmed: true");
    expect(menu).toContain('className="md-room-save-shortcut"');
    expect(menu).toContain("onClick={onReviewSave}");
    expect(styles).toContain("position: sticky;");
    expect(styles).toContain("min-height: 44px;");
  });

  test("private invitations always offer a copy fallback on phones without clipboard access", () => {
    const room = source("src/components/group-order-room.tsx");
    expect(room).toContain("if (!navigator.clipboard?.writeText)");
    expect(room).toContain("await navigator.clipboard.writeText(url)");
    expect(room).toContain("setManualCopy(true)");
    expect(room).toContain("Select and copy the invitation below.");
    expect(room).toContain("onClick={(event) => event.currentTarget.select()}");
  });

  test("live admission remains explicitly gated, not inferred from published frontend", () => {
    const server = source("src/lib/mealdeck-shared-payments.server.ts");
    expect(server).toContain('env["MEALDECK_SHARED_PAYMENTS_ENABLED"] === "true"');
    expect(server).toContain("readGroupLinkSecret(env) !== null");
    expect(server).toContain("newGroupRoomsAreOpen(serverNow())");
  });
});
