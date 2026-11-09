import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { EMPTY_CUSTOMER_PREFERENCES } from "../src/lib/mealdeck-customer";
import { renderMealDeckAuthEmail } from "../src/lib/mealdeck-auth-email-templates";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("MealDeck registration clarity and notifications", () => {
  test("all marketing and order notification preferences default to off", () => {
    expect(EMPTY_CUSTOMER_PREFERENCES).toEqual({
      emailMarketing: false, pushMarketing: false, orderNotifications: false,
    });
  });

  test("registration clearly explains two steps and displays optional preferences", () => {
    const account = read("src/components/customer-account.tsx");
    expect(account).toContain("Step 1 of 2:");
    expect(account).toContain("Step 2:");
    expect(account).toContain("Notification preferences");
    expect(account).toContain("Email me offers and discounts");
    expect(account).toContain("Send offers to my phone (app notifications)");
    expect(account).toContain("Send updates about my orders");
    expect(account).toContain('id="registration-notifications"');
    expect(account).toContain("Marketing alerts are optional");
  });

  test("signed-in account has a discoverable notification shortcut and permission instructions", () => {
    const account = read("src/components/customer-account.tsx");
    expect(account).toContain('href="#notification-preferences"');
    expect(account).toContain('id="device-notifications"');
    expect(account).toContain("Browser permission is separate from marketing consent");
    expect(account).toContain("Save details & preferences");
    expect(account).toContain("enableCustomerDeviceNotifications");
  });

  test("every auth template references the approved immutable card logo", () => {
    const logo = "/email/mealdeck-card-logo-v2.png";
    const dynamic = renderMealDeckAuthEmail("signup", { code: "123456" });
    expect(dynamic.html).toContain(logo);
    expect(read("src/lib/email-templates/mealdeck-layout.tsx")).toContain(logo);
    const names = [
      "signup", "magiclink", "recovery", "invite", "email_change", "reauthentication",
      "email_changed_notification", "phone_changed_notification", "password_changed_notification",
      "identity_linked_notification", "identity_unlinked_notification",
      "mfa_factor_enrolled_notification", "mfa_factor_unenrolled_notification",
    ];
    for (const name of names) {
      const html = read("emails/auth/" + name + ".html");
      expect(html).toContain(logo);
      expect(html).not.toContain("/email/mealdeck-logo.png");
    }
  });
});
