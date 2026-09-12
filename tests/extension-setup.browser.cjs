const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const root = path.resolve(__dirname, "..");
const origin = process.env.BEARPLANS_TEST_URL || "http://127.0.0.1:5001";
const artifacts = path.join(root, "artifacts/extension-setup");
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole("link", { name: "Set up extension" }).waitFor();
    await page.screenshot({ path: path.join(artifacts, "home-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "Saved Schedules", exact: true }).first().click();
    assert(await page.locator("#savedSchedulesPopup").isVisible());
    await page.locator("#savedSchedulesPopup").getByRole("button", { name: "Close" }).click();
    await page.locator("#nextBtnSchool").click();
    await page.locator("#dropdownMenu").waitFor({ state: "attached" });
    await page.waitForFunction(() => document.getElementById("section1").style.display === "block");
    await page.getByRole("heading", { name: "Select Courses", exact: true }).click();
    await page.locator("#section1").getByRole("button", { name: "Previous" }).click();
    await page.getByRole("link", { name: "Set up extension" }).click();
    await page.waitForFunction(() => document.querySelector("[data-connection-check]").dataset.state === "missing");
    await page.getByText("Install the preview for testing", { exact: true }).click();
    const download = await page.request.get(`${origin}/static/downloads/bearplans-workday-importer.zip`);
    assert.equal(download.status(), 200);
    assert.equal((await download.body()).subarray(0, 2).toString(), "PK");
    await page.screenshot({ path: path.join(artifacts, "guide-desktop.png"), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

    // Exercise the real site bridge with a read-only mock extension runtime.
    await page.addInitScript(() => {
      window.setupRequests = [];
      window.setupResponse = { ok: true, term: "", job: null };
      window.chrome = { runtime: { sendMessage(message, callback) {
        window.setupRequests.push(message.type);
        callback(window.setupResponse);
      } } };
    });
    await page.addInitScript({ path: path.join(root, "workday-extension/site-bridge.js") });
    await page.reload();
    await page.waitForFunction(() => document.querySelector("[data-connection-check]").dataset.state === "connected");
    assert.deepEqual(await page.evaluate(() => [...new Set(window.setupRequests)]), ["BP_EXPORT_CONTEXT"]);
    await page.screenshot({ path: path.join(artifacts, "guide-connected.png"), fullPage: true });
    await page.evaluate(() => { window.setupResponse = { ok: false, error: "Start from your selected site." }; });
    await page.getByRole("button", { name: "Check again" }).click();
    await page.getByText("Extension found, but it could not connect here.", { exact: true }).waitFor();
    await page.route("**/api/workday/health", route => route.fulfill({ status: 404, body: "Not found" }));
    await page.getByRole("button", { name: "Check again" }).click();
    await page.getByText("This BearPlans server is not ready.", { exact: true }).waitFor();
    await page.unroute("**/api/workday/health");
    await page.route("**/api/workday/health", route => route.fulfill({ status: 200, body: "<html>Coming soon</html>" }));
    await page.getByRole("button", { name: "Check again" }).click();
    await page.getByText("This BearPlans server is not ready.", { exact: true }).waitFor();
    await page.unroute("**/api/workday/health");
    await page.goto(`${origin}/privacy`);
    await page.getByRole("heading", { name: "Privacy and data use" }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();

    const mobile = await browser.newContext({ ...devices["iPhone 13"] });
    const phone = await mobile.newPage();
    await phone.goto(origin);
    await phone.screenshot({ path: path.join(artifacts, "home-mobile.png"), fullPage: true });
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await phone.getByRole("link", { name: "Set up extension" }).click();
    await phone.getByText("Open this guide in desktop Google Chrome.", { exact: true }).waitFor();
    assert.equal(await phone.locator("[data-beta-install]").isVisible(), false);
    await phone.screenshot({ path: path.join(artifacts, "guide-mobile.png"), fullPage: true });
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await phone.setViewportSize({ width: 320, height: 640 });
    await phone.goto(`${origin}/privacy`);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mobile.close();

    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await noJS.newPage();
    await staticPage.goto(`${origin}/extension`);
    await staticPage.getByText("Install the preview for testing", { exact: true }).click();
    assert(await staticPage.getByRole("link", { name: "Download the extension ZIP" }).isVisible());
    await noJS.close();
    console.log("PASS: home scheduler, guide, ZIP download, read-only bridge, wrong connection, server failures, mobile and no-JS.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
