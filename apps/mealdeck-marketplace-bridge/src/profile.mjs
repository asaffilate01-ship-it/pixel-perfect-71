import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ACTIONS,
  ACTION_FROM,
  BridgeError,
  FULFILMENTS,
  PLATFORMS,
  STATES,
  UUID,
  evidence,
  requireThat,
  text,
  timestamp,
} from "./contracts.mjs";

const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];
const XPATH_NAME = "[A-Za-z_][A-Za-z0-9_.:-]*";
const XPATH_PART = `(?:\\*|${XPATH_NAME})(?:\\[(?:[1-9]\\d*|@${XPATH_NAME}=(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'))\\])*`;
const SCOPED_XPATH = new RegExp(`^\\.//${XPATH_PART}(?:/{1,2}${XPATH_PART})*$`);
export function isScopedXPath(value) {
  return (
    typeof value === "string" &&
    !value.includes("..") &&
    !value.includes("::") &&
    !value.includes("|") &&
    SCOPED_XPATH.test(value)
  );
}
export function loopbackUrl(value) {
  const url = new URL(value);
  requireThat(
    url.protocol === "http:" &&
      LOOPBACK.includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    "profile_mismatch",
  );
  return url;
}
export function validAndroidPackage(value) {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(value)
  );
}
export function validateAndroidConnection(android) {
  requireThat(
    android &&
      typeof android.deviceIdEnvironment === "string" &&
      /^MEALDECK_[A-Z0-9_]+$/.test(android.deviceIdEnvironment),
    "profile_mismatch",
  );
  const url = loopbackUrl(android.appiumUrl);
  requireThat(
    Number.isInteger(android.systemPort) &&
      android.systemPort >= 1024 &&
      android.systemPort <= 65535 &&
      android.systemPort !== Number(url.port || 80),
    "profile_mismatch",
  );
  return android;
}
function selector(value, transport) {
  requireThat(value && typeof value === "object", "profile_mismatch");
  requireThat(
    (transport === "playwright" ? ["css"] : ["id", "accessibility id", "xpath"]).includes(
      value.using,
    ),
    "profile_mismatch",
  );
  text(value.value, 800);
  // No arbitrary JS/UiAutomator expression or locator engine; nested XPath stays within its element.
  requireThat(
    !value.value.includes(">>") && (value.using !== "xpath" || isScopedXPath(value.value)),
    "profile_mismatch",
  );
}
function field(value, transport, optional = false) {
  if (optional && value == null) return;
  requireThat(value && typeof value === "object", "profile_mismatch");
  selector(value.selector, transport);
  if (value.attribute !== undefined)
    requireThat(/^[a-zA-Z][\w:-]{0,99}$/.test(value.attribute), "profile_mismatch");
  if (value.trim !== undefined) requireThat(typeof value.trim === "boolean", "profile_mismatch");
  if (value.optional !== undefined)
    requireThat(typeof value.optional === "boolean", "profile_mismatch");
  if (value.capture !== undefined) {
    requireThat(
      typeof value.capture === "string" &&
        value.capture.length <= 500 &&
        value.capture.startsWith("^") &&
        value.capture.endsWith("$"),
      "profile_mismatch",
    );
    try {
      new RegExp(value.capture, "u");
    } catch {
      throw new BridgeError("profile_mismatch");
    }
  }
  if (value.map !== undefined)
    requireThat(
      value.map && typeof value.map === "object" && !Array.isArray(value.map),
      "profile_mismatch",
    );
}
function enumField(value, transport, allowed) {
  field(value, transport);
  requireThat(
    value.map &&
      Object.keys(value.map).length > 0 &&
      Object.values(value.map).every((x) => allowed.includes(x)),
    "profile_mismatch",
  );
}
function identityFields(value, transport) {
  requireThat(value && typeof value === "object", "profile_mismatch");
  field(value.externalOrderId, transport);
  field(value.displayReference, transport);
  requireThat(
    !value.externalOrderId.optional && !value.displayReference.optional,
    "profile_mismatch",
  );
}

/** Profiles are commissioned locally and matched to the independently enabled server connection. */
export function validateProfile(profile, { fixture = false, now = Date.now() } = {}) {
  requireThat(
    profile && profile.schemaVersion === 1 && PLATFORMS.includes(profile.platform),
    "profile_mismatch",
  );
  evidence(profile);
  requireThat(profile.environment === (fixture ? "fixture" : "live"), "profile_mismatch");
  requireThat(profile.commissioning?.status === "verified", "profile_mismatch");
  if (!fixture) {
    text(profile.commissioning.accessAuthorizationReference, 300);
    text(profile.commissioning.deviceOrBrowserVersion, 200);
    const verifiedAt = Date.parse(timestamp(profile.commissioning.verifiedAt));
    requireThat(verifiedAt <= now, "profile_mismatch");
    if (profile.commissioning.expiresAt != null) {
      const expiresAt = Date.parse(timestamp(profile.commissioning.expiresAt));
      requireThat(expiresAt > now && expiresAt > verifiedAt, "profile_mismatch");
    }
  }
  const transport = profile.transport;
  requireThat(
    (profile.platform === "uber_eats" ? ["playwright", "appium"] : ["appium"]).includes(transport),
    "profile_mismatch",
  );
  if (transport === "playwright") {
    const url = new URL(profile.pageUrl);
    if (fixture) loopbackUrl(profile.pageUrl);
    else
      requireThat(
        url.protocol === "https:" &&
          url.hostname === "merchants.ubereats.com" &&
          !url.port &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash,
        "profile_mismatch",
      );
  } else {
    requireThat(validAndroidPackage(profile.appPackage), "profile_mismatch");
    // Uber's installed merchant package is deliberately unknown until the actual Sunmi is inspected.
    // Whatever is commissioned is matched exactly against the session and foreground package.
    if (!fixture && profile.platform === "just_eat")
      requireThat(profile.appPackage === "com.justeat.orderpad", "profile_mismatch");
  }
  const screen = profile.screen;
  requireThat(screen && typeof screen === "object", "profile_mismatch");
  field(screen.storeId, transport);
  requireThat(
    Array.isArray(screen.guards) && screen.guards.length >= 1 && screen.guards.length <= 10,
    "profile_mismatch",
  );
  for (const guard of screen.guards) {
    field(guard.field, transport);
    text(guard.equals, 500);
  }
  selector(screen.orders, transport);
  selector(screen.empty, transport);
  field(screen.orderCount, transport); // Never silently import only the visible half of a virtualised list.
  identityFields(screen.identity, transport);
  if (screen.detail) {
    selector(screen.detail.open, transport);
    selector(screen.detail.root, transport);
    selector(screen.detail.close, transport);
    identityFields(screen.detail.identity, transport);
  }
  if (screen.views !== undefined) {
    requireThat(
      Array.isArray(screen.views) && screen.views.length > 0 && screen.views.length <= 6,
      "profile_mismatch",
    );
    const names = new Set();
    for (const view of screen.views) {
      text(view.name, 80);
      requireThat(!names.has(view.name), "profile_mismatch");
      names.add(view.name);
      selector(view.navigate, transport);
      field(view.guard?.field, transport);
      text(view.guard.equals, 500);
      for (const key of ["orders", "empty"])
        if (view[key] !== undefined) selector(view[key], transport);
      if (view.orderCount !== undefined) field(view.orderCount, transport);
      if (view.identity !== undefined) identityFields(view.identity, transport);
      if (view.detail) {
        selector(view.detail.open, transport);
        selector(view.detail.root, transport);
        selector(view.detail.close, transport);
        identityFields(view.detail.identity, transport);
      }
    }
  }
  const fields = profile.fields;
  requireThat(fields && typeof fields === "object", "profile_mismatch");
  enumField(fields.state, transport, STATES);
  enumField(fields.fulfilment, transport, FULFILMENTS);
  enumField(fields.paymentResponsibility, transport, ["platform"]);
  field(fields.currency, transport);
  field(fields.placedAt, transport);
  field(fields.totalPence, transport);
  field(fields.notes, transport, true);
  const items = fields.items;
  requireThat(items && typeof items === "object", "profile_mismatch");
  selector(items.selector, transport);
  field(items.count, transport); // Commissioning must prove every purchased line is represented.
  field(items.externalLineId, transport, true);
  field(items.name, transport);
  field(items.quantity, transport);
  field(items.unitPricePence, transport, true);
  field(items.notes, transport, true);
  if (items.modifiers) {
    selector(items.modifiers.selector, transport);
    field(items.modifiers.count, transport);
    field(items.modifiers.name, transport);
    field(items.modifiers.quantity, transport);
  }
  requireThat(
    profile.actions && Object.keys(profile.actions).every((x) => ACTIONS.includes(x)),
    "profile_mismatch",
  );
  for (const action of ACTIONS) {
    const rule = profile.actions[action];
    if (rule == null) continue;
    selector(rule.button, transport);
    requireThat(
      Array.isArray(rule.fromStates) &&
        rule.fromStates.length > 0 &&
        rule.fromStates.every((x) => ACTION_FROM[action].includes(x)),
      "profile_mismatch",
    );
    requireThat(
      Array.isArray(rule.fulfilments) &&
        rule.fulfilments.length > 0 &&
        rule.fulfilments.every((x) => FULFILMENTS.includes(x)),
      "profile_mismatch",
    );
    if (rule.confirmation) {
      selector(rule.confirmation.root, transport);
      selector(rule.confirmation.button, transport);
      identityFields(rule.confirmation.identity, transport);
    }
  }
  return profile;
}

export async function loadConfig(path, { permitDisabled = false } = {}) {
  const raw = await readFile(path, "utf8");
  requireThat(Buffer.byteLength(raw) <= 100_000, "profile_mismatch");
  const config = JSON.parse(raw);
  requireThat(
    config.schemaVersion === 1 && ["disabled", "observe", "live"].includes(config.mode),
    "profile_mismatch",
  );
  if (config.mode === "disabled" && permitDisabled) return config;
  requireThat(config.mode !== "disabled", "profile_mismatch");
  requireThat(UUID.test(config.connectorId), "profile_mismatch");
  const server = new URL(config.serverUrl);
  requireThat(
    server.protocol === "https:" &&
      !server.username &&
      !server.password &&
      !server.search &&
      !server.hash &&
      server.pathname === "/",
    "profile_mismatch",
  );
  text(config.externalStoreId, 200);
  requireThat(
    typeof config.tokenEnvironment === "string" &&
      /^MEALDECK_[A-Z0-9_]+$/.test(config.tokenEnvironment),
    "profile_mismatch",
  );
  for (const name of ["stateDirectory", "profilePath"])
    requireThat(typeof config[name] === "string" && config[name].length > 0, "profile_mismatch");
  requireThat(
    Number.isInteger(config.pollIntervalMs) &&
      config.pollIntervalMs >= 1000 &&
      config.pollIntervalMs <= 60_000,
    "profile_mismatch",
  );
  const base = resolve(path, "..");
  config.stateDirectory = resolve(base, config.stateDirectory);
  const profileRaw = await readFile(resolve(base, config.profilePath), "utf8");
  requireThat(Buffer.byteLength(profileRaw) <= 100_000, "profile_mismatch");
  config.profile = validateProfile(JSON.parse(profileRaw));
  if (config.profile.transport === "playwright") {
    requireThat(
      config.browser && typeof config.browser.userDataDirectory === "string",
      "profile_mismatch",
    );
    config.browser.userDataDirectory = resolve(base, config.browser.userDataDirectory);
    requireThat(config.browser.userDataDirectory !== config.stateDirectory, "profile_mismatch");
  } else {
    validateAndroidConnection(config.android);
  }
  return config;
}
