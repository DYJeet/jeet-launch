// Actual Chromium/Next rendering; no market data, wallets or financial responses are mocked.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { open, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const dir = "programs/launch-custody/target/master-verification";
const log = await open(dir + "/v5-ux-server.log", "w");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3004",
  ],
  { stdio: ["ignore", log.fd, log.fd] },
);
await log.close();
let browser;
const results = [];
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error("Next exited");
    try {
      if ((await fetch("http://127.0.0.1:3004")).ok) break;
    } catch {}
    if (i === 59) throw Error("Next timeout");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({
    executablePath: process.env.JEET_CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox"],
  });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const path of ["/", "/explore", "/create", "/revenue"]) {
      const response = await page.goto("http://127.0.0.1:3004" + path);
      assert.equal(response.status(), 200);
      await page.waitForTimeout(200);
      const sizes = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(
        sizes.document <= sizes.viewport + 1,
        `${path} horizontal overflow ${JSON.stringify(sizes)}`,
      );
      assert.deepEqual(errors, [], `${path} client exception`);
      results.push({ width, path, ...sizes });
      console.log(
        `PASS UX ${width}px ${path}: rendered, no page exception or horizontal overflow`,
      );
    }
    await page.goto("http://127.0.0.1:3004");
    if (width < 1024) {
      const navigation = page.getByRole("navigation", {
        name: "Mobile navigation",
      });
      assert.ok(await navigation.isVisible());
      await navigation
        .getByRole("link", { name: "Explore", exact: true })
        .click();
    } else {
      await page
        .getByRole("link", { name: "Search verified launches" })
        .click();
    }
    await page.waitForURL("**/explore");
    await page.goto("http://127.0.0.1:3004/create");
    const creatorInput = page.getByRole("spinbutton", {
      name: /Dev Allocation/,
    });
    assert.equal(await creatorInput.inputValue(), "1");
    assert.equal(await creatorInput.getAttribute("min"), "0");
    assert.equal(await creatorInput.getAttribute("max"), "5");
    assert.ok(
      await page
        .getByRole("region", { name: "Platform fee disclosure" })
        .isVisible(),
    );
    assert.ok(
      await page
        .getByRole("region", { name: "Platform fee disclosure" })
        .getByText("Token creation platform fee: 0 SOL.", { exact: false })
        .isVisible(),
    );
    await page.goto("http://127.0.0.1:3004/explore");
    await page
      .getByRole("textbox", { name: "Search verified launches" })
      .fill("JEET");
    assert.ok(
      await page
        .getByText("Verified index not connected", { exact: false })
        .isVisible(),
    );
    results.push({
      width,
      checks:
        "zero creation fee; public V5 gated; accessible search; no fabricated launch listings",
    });
    console.log(
      `PASS UX ${width}px: fee disclosure and live capability gating`,
    );
    await page.close();
  }
  await writeFile(
    dir + "/v5-ux-evidence.json",
    JSON.stringify(results, null, 2),
  );
  console.log(`PASS UX ${results.length} checks`);
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const done = once(server, "exit");
    server.kill("SIGTERM");
    const t = setTimeout(() => server.kill("SIGKILL"), 5000);
    await done;
    clearTimeout(t);
  }
}
