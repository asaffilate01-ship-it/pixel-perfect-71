import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { customerEntryPolicy } from "../src/lib/mealdeck-customer-entry";
import {
  EMPTY_CUSTOMER_PREFERENCES,
  parseCustomerPreferences,
  validateCustomerRegistration,
} from "../src/lib/mealdeck-customer";
import {
  MEALDECK_COOKIE_CONSENT_KEY,
  allowsMealDeckOptionalCookies,
  makeMealDeckCookieConsent,
  parseMealDeckCookieConsent,
} from "../src/lib/mealdeck-cookie-consent";

describe("MealDeck 9 Nov immediate verified registration", () => {
  test("registration opens at 10:35 GMT while preserving verification requirements", () => {
    expect(customerEntryPolicy(new Date("2026-11-09T10:34:59Z")).emailRegistrationDeferred).toBe(true);
    expect(customerEntryPolicy(new Date("2026-11-09T10:35:00Z")).emailRegistrationDeferred).toBe(false);
    expect(customerEntryPolicy(new Date("2026-11-09T13:00:00Z")).emailRegistrationDeferred).toBe(false);
    const source = readFileSync(new URL("../src/lib/mealdeck-customer-browser.ts",import.meta.url),"utf8");
    expect(source).toContain("!user.email_confirmed_at");
    expect(source).toContain("mealdeck_customer_register_with_messages");
    expect(source).not.toContain("opens at 1pm Monday 9 November");
  });
  test("name, email, E.164 phone and separate marketing choices are normalised", () => {
    const clean = validateCustomerRegistration({
      name:"  Alex  Sample ",email:"ALEX@EXAMPLE.COM",phone:"07700 900123",
      preferences:{ ...EMPTY_CUSTOMER_PREFERENCES, smsMarketing:true, whatsappMarketing:false },
    });
    expect(clean.name).toBe("Alex Sample");
    expect(clean.email).toBe("alex@example.com");
    expect(clean.phone).toBe("+447700900123");
    expect(clean.preferences.smsMarketing).toBe(true);
    expect(clean.preferences.whatsappMarketing).toBe(false);
    expect(parseCustomerPreferences({emailMarketing:false,pushMarketing:false,orderNotifications:false,smsMarketing:"yes"})).toBeNull();
  });
  test("database change is isolated and changes no email verification or sender", () => {
    const sql=readFileSync(new URL("../deploy/mealdeck/post-install-migrations/20261109103500_mealdeck_registration_open_now.sql",import.meta.url),"utf8");
    expect(sql).toContain("mealdeck-independent-v1");
    expect(sql).toContain("2026-11-09 10:35:00");
    expect(sql).not.toContain("mailer_autoconfirm");
    expect(sql).not.toContain("dishbee_private.");
  });
});

describe("MealDeck electronic messaging and first visit cookies", () => {
  test("all optional cookie categories default off with distinct reject and accept", () => {
    expect(parseMealDeckCookieConsent(null)).toBeNull();
    expect(parseMealDeckCookieConsent('{"version":1,"analytics":"yes","marketing":false,"savedAt":"2026-11-09T10:35:00Z"}')).toBeNull();
    const reject = makeMealDeckCookieConsent(false,false,new Date("2026-11-09T10:35:00Z"));
    expect(allowsMealDeckOptionalCookies(reject,"analytics")).toBe(false);
    expect(allowsMealDeckOptionalCookies(reject,"marketing")).toBe(false);
    expect(allowsMealDeckOptionalCookies(makeMealDeckCookieConsent(true,false),"marketing")).toBe(false);
    expect(parseMealDeckCookieConsent(JSON.stringify(reject))).toEqual(reject);
    expect(MEALDECK_COOKIE_CONSENT_KEY).toContain("consent");
  });
  test("marketing permissions are separately revocable, logged and never public table grants", () => {
    const sql=readFileSync(new URL("../deploy/mealdeck/post-install-migrations/20261109104500_mealdeck_message_channel_consent.sql",import.meta.url),"utf8");
    expect(sql).toContain("sms_marketing");
    expect(sql).toContain("whatsapp_marketing");
    expect(sql).toContain("previous_allowed");
    expect(sql).toContain("customer_message_consent_events enable row level security");
    expect(sql).toContain("customer_update_with_messages");
    expect(sql).toContain("grant execute on function public.mealdeck_customer_update_with_messages");
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
