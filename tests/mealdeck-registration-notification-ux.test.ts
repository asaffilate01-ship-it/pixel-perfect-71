import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { EMPTY_CUSTOMER_PREFERENCES, parseCustomerPreferences } from "../src/lib/mealdeck-customer";
import { renderMealDeckAuthEmail } from "../src/lib/mealdeck-auth-email-templates";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("MealDeck registration clarity and notifications", () => {
  test("all marketing and order notification preferences default to off", () => {
    expect(EMPTY_CUSTOMER_PREFERENCES).toEqual({
      emailMarketing: false,
      pushMarketing: false,
      orderNotifications: false,
      smsMarketing: false,
      whatsappMarketing: false,
    });
  });

  test("registration clearly explains two steps and displays optional preferences", () => {
    const account = read("src/components/customer-account.tsx");
    expect(account).toContain("Join MealDeck in two steps");
    expect(account).toContain("Send verification email");
    expect(account).toContain("Choose your notifications");
    expect(account).toContain("Offers by email");
    expect(account).toContain("App offers and promotions");
    expect(account).toContain("Order status notifications");
    expect(account).toContain("Offers by SMS text");
    expect(account).toContain("Offers by WhatsApp");
    expect(account).toContain('id="registration-notifications"');
    expect(account).toContain("Member benefits and loyalty points become available.");
    expect(account).toContain("Enter the code from your email");
    expect(account).not.toContain('<details className="md-account-code">');
  });

  test("signed-in account has a discoverable notification shortcut and permission instructions", () => {
    const account = read("src/components/customer-account.tsx");
    expect(account).toContain('href="#notification-preferences"');
    expect(account).toContain('id="device-notifications"');
    expect(account).toContain("Save notification choices");
    expect(account).toContain('id="account-messages-heading"');
    expect(account).toContain("enable notifications on this phone");
    expect(account).toContain("enableCustomerDeviceNotifications");
  });


  test("push service failure never blocks sign-up or hides notification settings", () => {
    const account = read("src/components/customer-account.tsx");
    expect(account).toContain("const ready = await readCustomerCapabilities()");
    expect(account).toContain("void getMealDeckCustomerPushConfig()");
    expect(account).toContain("if (active) setPushPublicKey(null)");
    expect(account).not.toContain("if (!preferences.pushMarketing && !preferences.orderNotifications)");
  });

  test("SMS and WhatsApp marketing are separate, never inferred from phone ownership", () => {
    const browser = read("src/lib/mealdeck-customer-browser.ts");
    expect(browser).toContain("mealdeck_customer_profile_with_messages");
    expect(browser).toContain("mealdeck_customer_register_with_messages");
    expect(browser).toContain("mealdeck_customer_update_with_messages");
    expect(browser).toContain("p_sms_marketing: clean.preferences.smsMarketing === true");
    expect(browser).toContain("p_whatsapp_marketing: clean.preferences.whatsappMarketing === true");
    expect(parseCustomerPreferences({
      ...EMPTY_CUSTOMER_PREFERENCES,
      whatsappMarketing: "yes",
    })).toBeNull();
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
