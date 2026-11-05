import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTH_EMAIL_KINDS,
  renderMealDeckAuthEmail,
} from "../src/lib/mealdeck-auth-email-templates";
import {
  AUTH_EMAIL_SITE_ORIGIN,
  AUTH_CONFIRMATION_PATH,
} from "../src/lib/mealdeck-auth-email-links";

// Build reviewable SMTP templates locally. This script never calls an email/provider API.
const directory = join(import.meta.dirname, "../emails/auth");
mkdirSync(directory, { recursive: true });
const manifest: Record<string, { subject: string; html: string; text: string }> = {};
for (const kind of AUTH_EMAIL_KINDS) {
  const notification = kind.endsWith("_notification");
  const values = notification
    ? {}
    : {
        code: "{{ .Token }}",
        ...(kind !== "reauthentication"
          ? {
              confirmationUrl:
                AUTH_EMAIL_SITE_ORIGIN +
                AUTH_CONFIRMATION_PATH +
                "#confirmation_url={{ .ConfirmationURL | urlquery }}",
            }
          : {}),
      };
  const template = renderMealDeckAuthEmail(kind, values);
  writeFileSync(join(directory, kind + ".html"), template.html + "\n");
  writeFileSync(join(directory, kind + ".txt"), template.text + "\n");
  manifest[kind] = { subject: template.subject, html: kind + ".html", text: kind + ".txt" };
}
writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Wrote ${AUTH_EMAIL_KINDS.length} local MealDeck Auth HTML/text templates. No messages sent.`,
);
