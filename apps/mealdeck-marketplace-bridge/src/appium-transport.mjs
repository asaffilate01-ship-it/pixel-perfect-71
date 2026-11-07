import { BridgeError, requireThat, text } from "./contracts.mjs";
import {
  isScopedXPath,
  loopbackUrl,
  validAndroidPackage,
  validateAndroidConnection,
} from "./profile.mjs";

const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";

/** Narrow W3C/Appium client; deliberately has no shell, install, unlock, execute-script or arbitrary mobile command. */
export class AppiumTransport {
  constructor(baseUrl, profile, { fetchImpl = fetch } = {}) {
    this.baseUrl = loopbackUrl(baseUrl).toString().replace(/\/$/, "");
    this.profile = profile;
    this.fetch = fetchImpl;
    this.sessionId = null;
    this.connecting = false;
  }
  async request(method, path, body, timeoutMs = 10_000) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      requireThat(response.ok, "device_unavailable");
      const raw = await response.text();
      requireThat(Buffer.byteLength(raw) <= 1_000_000, "device_unavailable");
      const data = JSON.parse(raw);
      requireThat(!data.value?.error, "device_unavailable");
      return data.value;
    } catch (error) {
      throw error instanceof BridgeError ? error : new BridgeError("device_unavailable");
    }
  }
  async connect(deviceId, systemPort) {
    requireThat(this.sessionId === null && !this.connecting, "device_unavailable");
    requireThat(
      typeof deviceId === "string" && deviceId.trim().length > 0 && deviceId === deviceId.trim(),
      "profile_mismatch",
    );
    text(deviceId, 200);
    validateAndroidConnection({
      appiumUrl: this.baseUrl,
      deviceIdEnvironment: "MEALDECK_DEVICE_CHECK",
      systemPort,
    });
    requireThat(
      this.profile.transport === "appium" && validAndroidPackage(this.profile.appPackage),
      "profile_mismatch",
    );
    this.connecting = true;
    try {
      const session = await this.request(
        "POST",
        "/session",
        {
          capabilities: {
            alwaysMatch: {
              platformName: "Android",
              "appium:automationName": "UiAutomator2",
              "appium:udid": deviceId,
              "appium:systemPort": systemPort,
              "appium:appPackage": this.profile.appPackage,
              "appium:noReset": true,
              "appium:fullReset": false,
              "appium:autoLaunch": false,
              "appium:forceAppLaunch": false,
              "appium:shouldTerminateApp": false,
              "appium:dontStopAppOnReset": true,
              "appium:skipServerInstallation": true,
              "appium:skipDeviceInitialization": true,
              "appium:skipSettingsAppReinstall": true,
              "appium:skipUnlock": true,
              "appium:autoGrantPermissions": false,
              "appium:mockLocationApp": "",
              "appium:skipLogcatCapture": true,
              "appium:suppressKillServer": true,
              "appium:autoWebview": false,
              "appium:newCommandTimeout": 120,
            },
          },
        },
        60_000,
      );
      requireThat(
        typeof session?.sessionId === "string" && /^[\w-]{1,200}$/.test(session.sessionId),
        "device_unavailable",
      );
      this.sessionId = session.sessionId;
      const capabilities = session.capabilities;
      requireThat(capabilities && capabilities.platformName === "Android", "identity_mismatch");
      // Drivers may return extension capabilities with or without the Appium prefix.
      // Reject a missing/conflicting selection; never accept a fallback to the first attached tablet.
      for (const [name, expected] of [
        ["udid", deviceId],
        ["systemPort", systemPort],
        ["appPackage", this.profile.appPackage],
      ]) {
        const values = [capabilities[`appium:${name}`], capabilities[name]].filter(
          (value) => value !== undefined,
        );
        requireThat(
          values.length > 0 && values.every((value) => value === expected),
          "identity_mismatch",
        );
      }
      if (capabilities.deviceUDID !== undefined)
        requireThat(capabilities.deviceUDID === deviceId, "identity_mismatch");
    } catch (error) {
      // A rejected selection is never used for reads/clicks. Delete only this newly created session.
      try {
        await this.close();
      } catch {
        /* Its bounded server timeout remains the fallback. */
      }
      throw error;
    } finally {
      this.connecting = false;
    }
  }
  path(suffix) {
    requireThat(this.sessionId !== null, "device_unavailable");
    return `/session/${encodeURIComponent(this.sessionId)}${suffix}`;
  }
  async assertContext() {
    const actualPackage = await this.request("GET", this.path("/appium/device/current_package"));
    requireThat(actualPackage === this.profile.appPackage, "session_required");
  }
  async find(selector, scope = null) {
    requireThat(["id", "accessibility id", "xpath"].includes(selector?.using), "profile_mismatch");
    requireThat(selector.using !== "xpath" || isScopedXPath(selector.value), "profile_mismatch");
    const found = await this.request(
      "POST",
      this.path(scope ? `/element/${encodeURIComponent(scope)}/elements` : "/elements"),
      {
        using: selector.using,
        value: selector.value,
      },
    );
    requireThat(Array.isArray(found) && found.length <= 2000, "observation_incomplete");
    return found.map((element) => {
      const id = element[ELEMENT];
      requireThat(typeof id === "string" && id.length <= 200, "device_unavailable");
      return id;
    });
  }
  async text(handle) {
    return this.request("GET", this.path(`/element/${encodeURIComponent(handle)}/text`));
  }
  async attribute(handle, name) {
    return this.request(
      "GET",
      this.path(`/element/${encodeURIComponent(handle)}/attribute/${encodeURIComponent(name)}`),
    );
  }
  async click(handle, deadline = Date.now() + 5000) {
    requireThat(Date.now() < deadline, "command_uncertain");
    const elementPath = `/element/${encodeURIComponent(handle)}`;
    const visible = await this.request("GET", this.path(`${elementPath}/displayed`));
    const enabled = await this.request("GET", this.path(`${elementPath}/enabled`));
    requireThat(visible === true && enabled === true, "ui_unavailable");
    requireThat(Date.now() < deadline, "command_uncertain");
    await this.request(
      "POST",
      this.path(`${elementPath}/click`),
      {},
      Math.max(1, Math.min(5000, deadline - Date.now())),
    );
  }
  async dispose() {
    /* Appium owns its element cache for the session. */
  }
  async close() {
    if (this.sessionId !== null) {
      try {
        await this.request("DELETE", this.path(""));
      } finally {
        this.sessionId = null;
      }
    }
  }
}

export async function openAndroidDevice(config, environment = process.env) {
  validateAndroidConnection(config.android);
  const driver = new AppiumTransport(config.android.appiumUrl, config.profile);
  await driver.connect(environment[config.android.deviceIdEnvironment], config.android.systemPort);
  return driver;
}
