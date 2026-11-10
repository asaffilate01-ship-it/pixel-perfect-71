import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  canConfirmNotificationCampaign,
  notificationCampaignSchema,
} from "../src/lib/mealdeck-notification-campaigns-browser";

const source = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("MealDeck approved driver onboarding", () => {
  test("a driver can use an existing verified account's code but cannot create a role", () => {
    const driver = source("src/components/driver/driver-workspace.tsx");
    const browser = source("src/lib/mealdeck-driver-browser.ts");
    expect(driver).toContain("signInWithOtp");
    expect(driver).toContain("shouldCreateUser: false");
    expect(driver).toContain('type: "email"');
    expect(driver).toContain("mealdeck_driver_portal");
    expect(driver).toContain("Only kitchen-approved drivers");
    expect(browser).toContain("not been approved for MealDeck Driver");
  });

  test("manager approval needs a verified exact email and explicit confirmation", () => {
    const panel = source("src/components/ops/driver-dispatch-panel.tsx");
    const sql = source("deploy/mealdeck/post-install-migrations/20261109234500_mealdeck_driver_verified_email_lookup.sql");
    expect(panel).toContain("mealdeck_ops_driver_find_verified_email");
    expect(panel).toContain("mealdeck_ops_driver_enrol");
    expect(panel).toContain("Find verified account");
    expect(panel).toContain("Approve driver access");
    expect(panel).not.toContain("Existing Auth user UUID");
    expect(sql).toContain("kds_assert_scope(p_tenant,p_location,'staff.manage')");
    expect(sql).toContain("u.email_confirmed_at is not null");
    expect(sql).toContain("lower(u.email)=v_email");
    expect(sql).toContain("revoke all on function public.mealdeck_ops_driver_find_verified_email");
    expect(sql).not.toContain("insert into mealdeck_private.driver_roster");
  });
});

describe("MealDeck verified push and staff campaigns", () => {
  const now = Date.parse("2026-11-09T21:00:00Z");
  const campaign = notificationCampaignSchema.parse({
    campaignId: "f29b6a5a-97a9-4acd-a9b7-632b7aa77f98",
    title: "Member offer", body: "Open the offers page", path: "/offers",
    expiresAt: "2026-11-09T22:00:00Z", createdAt: "2026-11-09T20:59:00Z",
    status: "draft", eligibleDevices: 1, queued: 0, accepted: 0,
    failed: 0, skipped: 0,
  });

  test("a staff draft cannot send without an opted-in device or after 15 minutes", () => {
    expect(canConfirmNotificationCampaign(campaign, true, now)).toBe(true);
    expect(canConfirmNotificationCampaign({ ...campaign, eligibleDevices: 0 }, true, now)).toBe(false);
    expect(canConfirmNotificationCampaign(campaign, true, now + 16 * 60_000)).toBe(false);
    expect(canConfirmNotificationCampaign(campaign, false, now)).toBe(false);
  });

  test("a browser prompt alone is never called a verified saved push subscription", () => {
    const account = source("src/components/customer-account.tsx");
    const service = source("src/lib/mealdeck-customer-notifications.ts");
    expect(account).toContain('readCustomerDeviceNotifications()');
    expect(account).toContain('!== "connected"');
    expect(account).toContain("Retry notification connection");
    expect(service).toContain("navigator.serviceWorker.ready");
    expect(service).toContain("mealdeck_customer_save_push");
    expect(account).toContain("onClick={() => void changeDevice(false)}");
  });

  test("Operations gives useful errors for MFA, finance permissions and stale drafts", () => {
    const backend = source("src/lib/mealdeck-notifications.server.ts");
    const panel = source("src/components/ops/notification-campaign-panel.tsx");
    expect(backend).toContain("mealdeck_push_mfa_required");
    expect(backend).toContain("mealdeck_push_campaign_forbidden");
    expect(backend).toContain("mealdeck_push_campaign_expired");
    expect(panel).toContain("no opted-in phone is subscribed");
    expect(panel).toContain("15-minute approval window");
  });
});
