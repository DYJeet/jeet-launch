// Real Chromium codec and creation controls; no chain/market success is simulated.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { open, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const dir = "programs/launch-custody/target/master-verification",
  log = await open(dir + "/v6-image-browser-server.log", "w"),
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3005",
    ],
    { stdio: ["ignore", log.fd, log.fd] },
  );
await log.close();
let browser;
const results = [];
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error("App exited");
    try {
      if (
        (
          await fetch("http://127.0.0.1:3005/create", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        break;
    } catch {}
    if (i === 59) throw Error("Startup timeout");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({
    executablePath: process.env.JEET_CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox"],
  });
  const png = await readFile("public/jeet-promo.png");
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://127.0.0.1:3005/create");
    await page.getByPlaceholder("JeeT Cat", { exact: true }).fill("Image Test");
    await page.getByPlaceholder("JEET", { exact: true }).fill("IMGTEST");
    await page
      .getByPlaceholder("Tell the community what you're launching...")
      .fill("A genuine local input validation acceptance test.");
    const ready = async (disabled) => {
      let count = 0;
      for (const b of await page
        .getByRole("button", {
          name: /Review.*Launch|Complete Required Fields/i,
        })
        .all())
        if (await b.isVisible()) {
          count++;
          if (disabled) await expect(b).toBeDisabled();
          else await expect(b).toBeEnabled();
        }
      assert.ok(count);
    };
    await ready(false);
    const file = page.getByLabel("Token logo image"),
      preview = page.locator('img[alt="Token logo preview"]').first();
    await file.setInputFiles({
      name: "actual.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(preview).toBeVisible();
    await ready(false);
    await file.setInputFiles({
      name: "forged.png",
      mimeType: "image/png",
      buffer: Buffer.from('<svg onload="alert(1)"/>'),
    });
    await expect(
      page.getByText("Image contents must match a PNG, JPG, or WEBP file.", {
        exact: true,
      }),
    ).toBeVisible();
    await ready(true);
    await page.getByRole("button", { name: "Remove token logo" }).click();
    await expect(preview).toHaveCount(0);
    await ready(false);
    await file.setInputFiles({
      name: "truncated.png",
      mimeType: "image/png",
      buffer: png.subarray(0, 24),
    });
    await expect(
      page.getByText("Image contents could not be decoded.", { exact: false }),
    ).toBeVisible();
    await ready(true);
    await page.getByRole("button", { name: "Remove token logo" }).click();
    await page
      .getByPlaceholder("JeeT Cat", { exact: true })
      .fill("🐱".repeat(9));
    await ready(true);
    await page
      .getByPlaceholder("JeeT Cat", { exact: true })
      .fill("🐱".repeat(8));
    await ready(false);
    await file.setInputFiles({
      name: "actual.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(preview).toBeVisible();
    const size = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(size.document <= size.viewport + 1);
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: dir + `/v6-create-${width}.png`,
      fullPage: true,
    });
    results.push({
      width,
      checks:
        "valid PNG decoded; forged/truncated files rejected; review blocked; removal/recovery; UTF-8 boundary; no overflow/client exception",
    });
    console.log("PASS creation browser " + width + "px");
    await page.close();
  }
  const page = await browser.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, "createImageBitmap", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("http://127.0.0.1:3005/create");
  await page
    .getByLabel("Token logo image")
    .setInputFiles({
      name: "fallback.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(
    page.locator('img[alt="Token logo preview"]').first(),
  ).toBeVisible();
  results.push({ check: "real Image.decode fallback" });
  await page.close();
  const race = await browser.newPage();
  await race.addInitScript(() => {
    const original = window.createImageBitmap.bind(window),
      create = URL.createObjectURL.bind(URL);
    window.imageAdmissions = [];
    URL.createObjectURL = (b) => {
      if (b instanceof File) window.imageAdmissions.push(b.name);
      return create(b);
    };
    window.createImageBitmap = async (...args) => {
      if (args[0] instanceof File && args[0].name === "slow.png")
        await new Promise((r) => setTimeout(r, 1000));
      return original(...args);
    };
  });
  await race.goto("http://127.0.0.1:3005/create");
  const input = race.getByLabel("Token logo image");
  await input.setInputFiles({
    name: "slow.png",
    mimeType: "image/png",
    buffer: png,
  });
  await input.setInputFiles({
    name: "latest.png",
    mimeType: "image/png",
    buffer: png,
  });
  await race.waitForTimeout(1300);
  const names = await race.evaluate(() => window.imageAdmissions);
  assert.ok(names.includes("latest.png"));
  assert.ok(!names.includes("slow.png"));
  results.push({
    check: "out-of-order codec completion cannot overwrite latest upload",
  });
  await race.close();
  await writeFile(
    dir + "/v6-image-browser-evidence.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    "CREATION INPUTS VERIFIED " + results.length + " acceptance groups",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const done = once(server, "exit");
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    await done;
    clearTimeout(timer);
  }
}
