import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const baseURL = process.env.BROWSER_TEST_BASE_URL ?? "http://127.0.0.1:4173";
let browser;
let server;
before(async () => {
  if (!process.env.BROWSER_TEST_BASE_URL) {
    server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { stdio: "pipe" });
    let output = "";
    server.stdout.on("data", chunk => { output = (output + chunk).slice(-4000); });
    server.stderr.on("data", chunk => { output = (output + chunk).slice(-4000); });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Preview server exited: ${output}`);
      try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(1500) })).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.ok(ready, `Preview server did not start: ${output}`);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  });
}, { timeout: 60000 });
after(async () => {
  await browser?.close();
  server?.kill("SIGTERM");
});

for (const width of [390, 1280]) {
  test(`menu preview and launch protection at ${width}px`, { timeout: 45000 }, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${baseURL}/order`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Every craving. Coming soon." }).waitFor();
      const main = page.getByRole("main");
      const allDishes = await main.locator("article").count();
      assert.ok(allDishes > 0, "preview contains dishes");
      const search = page.getByRole("searchbox", { name: "Search preview menu" });
      await search.fill("no-matching-dish-123");
      await main.getByRole("status").filter({ hasText: "No dishes match" }).waitFor();
      await page.getByRole("button", { name: "Clear filters", exact: true }).click();
      assert.equal(await search.inputValue(), "");
      await page.getByRole("combobox", { name: "Maximum dish price" }).selectOption("500");
      await page.waitForFunction(() => [...document.querySelectorAll("main article")].every(card => Number(card.getAttribute("data-price-pence")) <= 500));
      assert.ok(await main.locator("article").count() > 0, "budget filter retains affordable dishes");
      await page.getByRole("combobox", { name: "Sort dishes" }).selectOption("price-high");
      await page.waitForFunction(() => {
        const prices = [...document.querySelectorAll("main article")].map(card => Number(card.getAttribute("data-price-pence")));
        return prices.every((price, index) => index === 0 || prices[index - 1] >= price);
      });
      await page.getByRole("button", { name: "Clear filters", exact: true }).click();
      assert.equal(await page.getByRole("combobox", { name: "Maximum dish price" }).inputValue(), "all");
      assert.equal(await page.getByRole("combobox", { name: "Sort dishes" }).inputValue(), "menu");
      await page.getByRole("group", { name: "Food categories" }).getByRole("button", { name: /Drinks/ }).click();
      assert.ok(await main.locator("article").count() > 0, "category has dishes");
      await page.waitForFunction(count => document.querySelectorAll("main article").length < count, allDishes);
      await page.getByRole("button", { name: "St Albans", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "St Albans", exact: true }).getAttribute("aria-pressed"), "true");
      assert.ok(await main.locator("article").count() > 0, "location switch restores dishes");
      assert.equal(await main.getByRole("button", { name: /checkout|payment|add to basket/i }).count(), 0, "launch preview cannot place an order");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal overflow");
      assert.deepEqual(errors, [], "no browser runtime errors");
    } finally {
      await page.close();
    }
  });
}

for (const width of [390, 1280]) {
  test(`franchise guide at ${width}px`, { timeout: 45000 }, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(`${baseURL}/franchise`, { waitUntil: "networkidle" });
      const guide = page.getByRole("region", { name: "Find a franchise answer" });
      await guide.getByRole("button", { name: "Equipment", exact: true }).click();
      await guide.getByRole("article").first().waitFor();
      const source = guide.getByRole("link", { name: "View in FAQs" }).first();
      const href = await source.getAttribute("href");
      assert.equal(await page.locator(href).count(), 1);
      await source.click();
      assert.equal(await page.locator(href).evaluate(element => element.open), true);
      await guide.getByRole("button", { name: "Clear search", exact: true }).click();
      assert.equal(await guide.getByRole("searchbox").inputValue(), "");
      assert.equal(await guide.getByRole("searchbox").evaluate(element => element === document.activeElement), true);
      await guide.getByRole("searchbox").fill("How much money do I need?");
      await guide.getByRole("article").first().waitFor();
      await guide.getByRole("searchbox").fill("quantum astrology");
      await guide.getByText("0 related published answers").waitFor();
      assert.equal(await guide.getByRole("article").count(), 0);
      assert.equal(await guide.getByRole("link", { name: "View enquiry options" }).getAttribute("href"), "#apply");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    } finally { await page.close(); }
  });
}
