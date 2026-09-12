const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const origin = process.env.BEARPLANS_TEST_URL || "https://bearplans.pythonanywhere.com";
const output = path.resolve(__dirname, "../dist/store-submission");
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const health = await page.request.get(`${origin}/api/workday/health`);
    assert.equal(health.status(), 200);
    assert.deepEqual(await health.json(), { apiVersion: 1, status: "ok" });
    for (const route of ["/", "/extension", "/privacy", "/static/js/workday-export.js", "/static/css/extension-setup.css"]) {
      assert.equal((await page.request.get(origin + route)).status(), 200, route);
    }
    const generated = await page.request.post(`${origin}/api/workday/generate`, { data: {
      courses: [
        { courseCode: "ACCT 2610", courseName: "Principles of Financial Accounting", sections: [
          { section: "01", academicPeriod: "Fall 2025", days: "Mon/Wed", startTime: "8:30 AM", endTime: "9:50 AM", status: "Open" }
        ] },
        { courseCode: "ACCT 4013", courseName: "Ethics I", sections: [
          { section: "01", academicPeriod: "Fall 2025", days: "Tue/Thu", startTime: "2:30 PM", endTime: "3:50 PM", status: "Open" }
        ] }
      ], maxnumber: 10
    } });
    assert.equal(generated.status(), 200);
    const result = await generated.json();
    assert.equal(result.scheduleCount, 1);
    const resultURL = new URL(result.redirect, origin).href;
    assert.equal(new URL(resultURL).origin, origin);
    await page.goto(resultURL);
    await page.getByRole("button", { name: "Add to Workday", exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(output, "01-schedule-1280x800.png") });
    await page.getByRole("button", { name: "Add to Workday", exact: true }).first().click();
    await page.locator("#workday-schedule-name").fill("Fall planning demo");
    await page.screenshot({ path: path.join(output, "02-save-to-workday-1280x800.png") });
    // Only the unsubmitted confirmation form is captured. No Workday task is started.
    await page.locator("[data-export-close]").click();
    for (let index = 0; index < 6; index++) {
      const readback = await page.request.get(resultURL);
      assert.equal(readback.status(), 200);
      assert((await readback.text()).includes("Principles of Financial Accounting"));
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "public-check.json"), JSON.stringify({
      checkedAt: new Date().toISOString(), origin,
      health: "passed", publicPages: "passed", generation: "passed", resultReadbacks: 6,
      workdayWrites: 0, screenshotData: "Demonstration course data, not a claim of current section availability",
      resultURL, previewDownloadStatus: (await page.request.get(`${origin}/static/downloads/bearplans-workday-importer.zip`)).status()
    }, null, 2));
    console.log("PASS: public routes, schedule generation, six result readbacks and current screenshots. No Workday writes.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
