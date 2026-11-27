import { mkdir, chmod } from "node:fs/promises";
import { BridgeError, requireThat } from "./contracts.mjs";

/** Uses fixed ElementHandles: a reordering list cannot retarget a pending click by index. */
export class PlaywrightTransport {
  constructor(page, profile, close = async () => {}) {
    this.page = page;
    this.profile = profile;
    this.close = close;
  }
  async assertContext() {
    const expected = new URL(this.profile.pageUrl);
    const actual = new URL(this.page.url());
    requireThat(
      actual.origin === expected.origin &&
        (actual.pathname === expected.pathname ||
          actual.pathname.startsWith(`${expected.pathname.replace(/\/$/, "")}/`)),
      "session_required",
    );
  }
  async find(selector, scope = null) {
    requireThat(selector?.using === "css", "profile_mismatch");
    return (scope ?? this.page).$$(`css=${selector.value}`);
  }
  async text(handle) {
    return handle.textContent();
  }
  async attribute(handle, name) {
    return handle.getAttribute(name);
  }
  async click(handle, deadline = Date.now() + 5000) {
    requireThat(Date.now() < deadline, "command_uncertain");
    requireThat((await handle.isVisible()) && (await handle.isEnabled()), "ui_unavailable");
    await handle.click({
      timeout: Math.max(1, Math.min(5000, deadline - Date.now())),
      noWaitAfter: true,
    });
  }
  async dispose(handles) {
    await Promise.all(handles.map((handle) => handle.dispose()));
  }
}

export async function openUberBrowser(config) {
  const { chromium } = await import("playwright");
  const directory = config.browser.userDataDirectory;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  // A dedicated visible Chrome profile. No exported cookies, remote debugging port, stealth or login automation.
  const context = await chromium.launchPersistentContext(directory, {
    channel: "chrome",
    headless: false,
  });
  try {
    const pages = context.pages().filter((page) => !page.isClosed());
    requireThat(pages.length <= 1, "session_required");
    const page = pages[0] ?? (await context.newPage());
    page.setDefaultTimeout(5000);
    if (page.url() === "about:blank")
      await page.goto(config.profile.pageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return new PlaywrightTransport(page, config.profile, () => context.close());
  } catch (error) {
    await context.close();
    throw error instanceof BridgeError ? error : new BridgeError("ui_unavailable");
  }
}
