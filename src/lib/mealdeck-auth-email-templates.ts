import { AUTH_EMAIL_SITE_ORIGIN } from "./mealdeck-auth-email-links";

export const AUTH_EMAIL_KINDS = [
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
  "reauthentication",
  "password_changed_notification",
  "email_changed_notification",
  "phone_changed_notification",
  "identity_linked_notification",
  "identity_unlinked_notification",
  "mfa_factor_enrolled_notification",
  "mfa_factor_unenrolled_notification",
] as const;
export type AuthEmailKind = (typeof AUTH_EMAIL_KINDS)[number];
type Copy = { subject: string; heading: string; body: string; action?: string };
export const AUTH_EMAIL_COPY: Record<AuthEmailKind, Copy> = {
  signup: {
    subject: "Verify your email for MealDeck",
    heading: "Verify your email",
    body: "Confirm this email address to continue with your MealDeck account.",
    action: "Verify email",
  },
  magiclink: {
    subject: "Your MealDeck sign-in link and code",
    heading: "Sign in to MealDeck",
    body: "Use this secure link or enter the code on the MealDeck screen where you requested it.",
    action: "Continue to sign in",
  },
  recovery: {
    subject: "Reset your MealDeck password",
    heading: "Reset your password",
    body: "You requested a password reset for your MealDeck account. Continue to the secure account recovery flow to choose a new password.",
    action: "Continue recovery",
  },
  invite: {
    subject: "Your invitation to MealDeck",
    heading: "You're invited to MealDeck",
    body: "An invitation has been created for this email address. Continue to review and accept it. Your account's access is set separately by MealDeck.",
    action: "Review invitation",
  },
  email_change: {
    subject: "Confirm your MealDeck email change",
    heading: "Confirm your email change",
    body: "Confirm this address for your requested email change. If confirmation messages arrived at both your current and new addresses, follow each message to complete the change.",
    action: "Confirm email change",
  },
  reauthentication: {
    subject: "Your MealDeck security code",
    heading: "Confirm it's you",
    body: "Enter this code on the MealDeck screen that requested it to continue the sensitive account action.",
  },
  password_changed_notification: {
    subject: "Your MealDeck password changed",
    heading: "Password changed",
    body: "The password for your MealDeck account has changed.",
  },
  email_changed_notification: {
    subject: "Your MealDeck email address changed",
    heading: "Email address changed",
    body: "The email address for your MealDeck account has changed. This notice was sent to the previous address.",
  },
  phone_changed_notification: {
    subject: "Your MealDeck phone number changed",
    heading: "Phone number changed",
    body: "The phone number for your MealDeck account has changed.",
  },
  identity_linked_notification: {
    subject: "A sign-in method was added to MealDeck",
    heading: "Sign-in method added",
    body: "A sign-in method was linked to your MealDeck account.",
  },
  identity_unlinked_notification: {
    subject: "A sign-in method was removed from MealDeck",
    heading: "Sign-in method removed",
    body: "A sign-in method was removed from your MealDeck account.",
  },
  mfa_factor_enrolled_notification: {
    subject: "A verification method was added to MealDeck",
    heading: "Verification method added",
    body: "A second-factor verification method was added to your MealDeck account.",
  },
  mfa_factor_unenrolled_notification: {
    subject: "A verification method was removed from MealDeck",
    heading: "Verification method removed",
    body: "A second-factor verification method was removed from your MealDeck account.",
  },
};
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
const footer = "MealDeck is a trading name of 313 Brands Ltd. Powered by Dishbee.";

/** Inline email-safe markup. No user metadata, remote fonts, trackers or promotional copy. */
export function renderMealDeckAuthEmail(
  kind: AuthEmailKind,
  values: { code?: string; confirmationUrl?: string } = {},
) {
  const copy = AUTH_EMAIL_COPY[kind];
  const notification = kind.endsWith("_notification");
  const safety = notification
    ? "If you did not make this change, open MealDeck directly and contact the team to secure your account. Never share a sign-in or security code."
    : "Only continue if you requested this email. Never share this code or link. If you did not request it, you can ignore this email.";
  const codeHelp = kind === "reauthentication" ? "Your security code" : "Your one-time code";
  const continuation =
    values.confirmationUrl && copy.action
      ? `<p style="margin:24px 0;"><a href="${escapeHtml(values.confirmationUrl)}" style="display:inline-block;background:#c9121d;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:15px 24px;border-radius:8px;">${escapeHtml(copy.action)}</a></p><p style="font-size:14px;line-height:21px;color:#62594e;">The link opens a confirmation screen. Choose Continue there when you are ready. If you started on another device, enter the code on the original screen instead.</p>`
      : "";
  const code = values.code
    ? `<p style="font-size:14px;color:#62594e;margin:24px 0 8px;">${codeHelp}</p><p style="font-size:30px;line-height:40px;letter-spacing:5px;font-weight:bold;margin:0 0 20px;color:#111111;">${escapeHtml(values.code)}</p><p style="font-size:14px;line-height:21px;color:#62594e;">Use the latest email you requested. If the code or link has expired, request a fresh one from MealDeck.</p>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.subject)}</title></head><body style="margin:0;padding:0;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" style="width:100%;border-collapse:collapse;background:#ffffff;"><tr><td style="padding:24px 12px;"><table role="presentation" align="center" style="width:100%;max-width:560px;border-collapse:collapse;"><tr><td style="background:#111111;padding:20px 28px;"><img src="${AUTH_EMAIL_SITE_ORIGIN}/email/mealdeck-card-logo-v2.png" alt="MealDeck" width="200" height="200" style="display:block;margin:0 auto;width:200px;max-width:100%;height:auto;border:0;"></td></tr><tr><td style="background:#fff6e8;padding:28px;"><p style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;margin:0 0 16px;color:#951018;">Account security</p><h1 style="font-size:28px;line-height:34px;margin:0 0 18px;">${escapeHtml(copy.heading)}</h1><p style="font-size:16px;line-height:25px;margin:0;">${escapeHtml(copy.body)}</p>${continuation}${code}<p style="font-size:14px;line-height:21px;margin:24px 0 0;color:#62594e;">${escapeHtml(safety)}</p></td></tr><tr><td style="padding:20px 28px;font-size:12px;line-height:19px;color:#62594e;"><p style="margin:0 0 8px;">${footer}</p><a href="${AUTH_EMAIL_SITE_ORIGIN}" style="color:#951018;">mealdeck.co.uk</a></td></tr></table></td></tr></table></body></html>`;
  const text = [
    "MealDeck",
    copy.heading,
    copy.body,
    values.confirmationUrl
      ? `${copy.action}: ${values.confirmationUrl}\nChoose Continue on the confirmation screen. If you started on another device, enter the code on the original screen instead.`
      : "",
    values.code
      ? `${codeHelp}: ${values.code}\nUse the latest email you requested. Request a fresh email if it expires.`
      : "",
    safety,
    footer,
    AUTH_EMAIL_SITE_ORIGIN,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: copy.subject, html, text };
}
