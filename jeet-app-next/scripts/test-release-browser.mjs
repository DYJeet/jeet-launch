import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium, expect } from "@playwright/test";

const origin = "http://127.0.0.1:3013";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3013"], {
  env: { ...process.env, JEET_LOCAL_WALLET: "0", JEET_LOCAL_METADATA_VERIFY: "0" },
  stdio: "inherit",
});
let browser;
try {
  await expect.poll(async () => {
    try { return (await fetch(origin, { signal: AbortSignal.timeout(1000) })).status; }
    catch { return 0; }
  }, { timeout: 15000 }).toBe(200);
  browser = await chromium.launch({
    executablePath: process.env.JEET_CHROMIUM_PATH,
    headless: true, args: ["--no-sandbox"],
  });
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.getByRole("alert").filter({ hasText: "Verified index is unavailable" })).toBeVisible();
    await page.getByRole("link", { name: "Explore Launches", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Explore launches" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search verified launches" }).fill("JEET");
    await page.getByRole("button", { name: "Migrated" }).click();
    await expect(page.getByRole("button", { name: "Migrated" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("alert").filter({ hasText: "Verified index is unavailable" })).toContainText("Verified index is unavailable");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Verified index is unavailable" })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(origin + "/create");
    const fees = page.getByRole("region", { name: "Platform fee disclosure" });
    await expect(fees).toContainText("Token creation platform fee: 0 SOL");
    await expect(fees).toContainText("0.75% to JeeT Launch and 0.25% to the creator");
    await expect(fees).toContainText("Public V5 launches and graduation are disabled");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await fees.getByRole("link", { name: "View on-chain fee accounts and claims" }).click();
    await expect(page.getByRole("heading", { name: "JeeT Launch revenue" })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal((await page.request.get(origin + "/token/11111111111111111111111111111111")).status(), 404);
    assert.equal((await page.request.get(origin + "/local-create")).status(), 404);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px public navigation, responsive Explore, creation and revenue, retry and signing gates`);
    await page.close();
  }
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(timer);
  }
}
