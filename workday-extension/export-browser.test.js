const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const origin = process.env.BEARPLANS_TEST_URL || "http://127.0.0.1:5001";
const source = name => fs.readFileSync(path.join(__dirname, name), "utf8");

async function saverFixture(browser, mode) {
  const page = await browser.newPage();
  await page.setContent('<main id="workdayApplicationFrame"></main>');
  await page.evaluate(mode => {
    const course = { code: "ACCT 2610", section: "01", name: "Accounting", academicPeriod: "Fall 2025", meetings: [{ days: "M-W----", time: "08:30AM-09:50AM" }] };
    const state = window.fixture = {
      writes: [], actions: [], filterClicks: [], mode,
      job: { id: "test", name: "New test schedule", term: "Fall 2025", courses: [course], checked: [], completed: [],
        status: "running", phase: "navigate", index: 0, created: false, writePending: null }
    };
    const listeners = [];
    const field = (name, value) => `<li><label data-automation-id="formLabel">${name}</label><div data-automation-id="decorationWrapper">${value}</div></li>`;
    const item = (id, name) => `<div data-automation-id="selectedItem_${id}"><span data-automation-id="promptOption">${name}</span></div>`;
    function modal(title, body, actions) {
      const previous = document.querySelector('[role="dialog"]');
      if (previous) previous.remove();
      const node = document.createElement("section");
      node.setAttribute("role", "dialog");
      node.innerHTML = `<h2 data-automation-id="pageHeaderTitleText">${title}</h2>${body}`;
      for (const [name, action] of Object.entries(actions)) {
        const button = document.createElement("button");
        button.textContent = name;
        button.addEventListener("click", () => { state.actions.push(name); action(node); });
        node.append(button);
      }
      document.body.append(node);
      return node;
    }
    function courseView() {
      modal("View Course Section", item("15194$1", "ACCT 2610-01 - Accounting")
        + field("Academic Period", mode === "wrong-term" ? "Spring 2026" : "Fall 2025")
        + field("Status", "Open") + field("Meeting Patterns", mode === "stale-times" ? "Tue/Thu | 1:00 PM - 2:20 PM" : "Mon/Wed | 8:30 AM - 9:50 AM"), {
        Close: node => {
          node.remove();
          if (mode === "stale-pane") document.querySelector("main").setAttribute("aria-hidden", "true");
          if (mode === "input-loading") {
            const input = document.querySelector("main input");
            input.disabled = true;
            setTimeout(() => { input.disabled = false; }, 600);
          }
        }, "Add to Saved Schedule": () => addForm(),
        "Start Registration": () => { throw new Error("REGISTRATION MUST NEVER BE CLICKED"); }
      });
    }
    function timesForm() {
      const periods = mode === "half-term" ? field("Academic Periods", item("6100$1", "Fall 2025") + item("6100$2", "Fall Half A 2025")) + field("Academic Period", "Fall Half A 2025") : field("Academic Period", "Fall 2025");
      modal("Add Course Section to Saved Schedule", field("Saved Schedule", item("15873$123", ""))
        + field("Saved Schedule Name", "New test schedule") + periods
        + `<table><tbody><tr><td><input type="checkbox" checked></td><td>${item("15194$1", "ACCT 2610-01 - Accounting")}</td><td>Mon/Wed | 8:30 AM - 9:50 AM</td></tr>`
        + (mode === "extra-section" ? `<tr><td><input type="checkbox" checked></td><td>${item("15194$2", "ACCT 2610-02 - Accounting")}</td></tr>` : "") + "</tbody></table>", {
        OK: () => {
          state.writes.push("add");
          modal("Add Course Section to Saved Schedule", field("Saved Schedule", item(mode === "wrong-target" ? "15873$456" : "15873$123", ""))
            + field("Saved Schedule Name", "New test schedule") + periods
            + `<table><tbody><tr><td>${item("15194$1", "ACCT 2610-01 - Accounting")}</td><td>Mon/Wed | 8:30 AM - 9:50 AM</td></tr></tbody></table>`, {
            Done: node => node.remove(), "Start Registration": () => { throw new Error("REGISTRATION MUST NEVER BE CLICKED"); }
          });
        }, Cancel: node => node.remove()
      });
    }
    function addForm(selected = false) {
      const form = modal("Add Course Section to Saved Schedule", item("15194$1", "ACCT 2610-01 - Accounting")
        + field("Saved Schedule", `<input placeholder="Search">${selected ? item("15873$123", "New test schedule") : ""}`), {
        "Choose Times": timesForm, Cancel: node => node.remove()
      });
      form.querySelector("input").addEventListener("click", () => {
        const option = document.createElement("div");
        option.dataset.automationId = "promptOption";
        option.textContent = "Create Student Registration Saved Schedule";
        option.onclick = () => {
          option.remove();
          const created = modal("Create Student Registration Saved Schedule", field("Academic Period", "Fall 2025")
            + field("Saved Schedule Name", '<input type="text">'), {
            OK: () => { state.writes.push("create"); addForm(true); }, Cancel: node => node.remove()
          });
        };
        form.append(option);
      });
    }
    document.querySelector("main").innerHTML = `<input id="wd-AdvancedFacetedSearch-SearchTextBox-input"><button data-automation-id="advancedSearchButton">Search</button>
      <div data-automation-id="checkbox" title="2025-2026"><input type="checkbox"></div>
      <div data-automation-id="checkbox" title="2026-2027"><input type="checkbox" checked></div>
      <div data-automation-id="checkbox" title="Fall 2025 (08/25/2025-12/17/2025)"><input type="checkbox"></div>
      <div data-automation-id="checkbox" title="Undergraduate"><input type="checkbox"></div>
      <a data-automation-id="promptOption">ACCT 2610-01 - Accounting</a>`;
    document.querySelectorAll('[data-automation-id="checkbox"]').forEach(element => {
      element.querySelector("input").addEventListener("click", () => state.filterClicks.push(element.title));
    });
    document.querySelector("a").onclick = courseView;
    if (mode === "pending-write") {
      Object.assign(state.job, { phase: "create", created: false, writePending: { kind: "create" } });
    }
    window.chrome = {
      runtime: { onMessage: { addListener() {} }, async sendMessage(message) {
        const { payload = {} } = message;
        if (message.type === "BP_EXPORT_BEFORE_WRITE") {
          if (state.job.writePending) return { ok: false, error: "Duplicate write blocked" };
          state.job.writePending = { kind: payload.kind, course: payload.course };
          state.job.status = "writing";
        }
        if (message.type === "BP_EXPORT_UPDATE") Object.assign(state.job, payload.patch);
        return { ok: true, job: structuredClone(state.job) };
      } }, storage: { onChanged: { addListener(listener) { listeners.push(listener); } } }
    };
  }, mode);
  await page.addScriptTag({ content: source("export-common.js") });
  await page.addScriptTag({ content: source("workday-saver.js") });
  await page.waitForFunction(() => fixture.job.status === "paused" || fixture.job.status === "complete", { timeout: 15000 });
  const result = await page.evaluate(() => {
    fixture.filterStates = Object.fromEntries([...document.querySelectorAll('[data-automation-id="checkbox"]')]
      .map(element => [element.title, element.querySelector("input").checked]));
    return fixture;
  });
  assert(!result.actions.includes("Start Registration"));
  if (mode !== "pending-write") {
    assert.deepEqual(result.filterClicks, ["2025-2026"]);
    assert.deepEqual(result.filterStates, {
      "2025-2026": true,
      "2026-2027": true,
      "Fall 2025 (08/25/2025-12/17/2025)": false,
      Undergraduate: false
    });
  }
  await page.close();
  return result;
}

async function siteFixture(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const generated = await page.request.post(`${origin}/api/workday/generate`, { data: { courses: [
    { code: "ACCT 2610", name: "Principles of Financial Accounting", section: "01", academicPeriod: "Fall 2025", days: "M-W----", start: "08:30", end: "09:50" },
    { code: "ACCT 4013", name: "Ethics I", section: "01", academicPeriod: "Fall 2025", days: "-T-R---", start: "14:30", end: "15:50" }
  ] } });
  assert(generated.ok());
  await page.goto(`${origin}${(await generated.json()).redirect}`);
  assert.equal(await page.locator("#workday-export-schedules").count(), 1, "The local test schedule must still be available.");
  await page.evaluate(() => {
    window.requests = [];
    window.addEventListener("message", event => {
      const data = event.data;
      if (data?.channel !== "bearplans-workday-export" || data.direction !== "request") return;
      requests.push(data);
      let response = { ok: true };
      if (data.action === "START") response = { ok: true, job: { id: "ui-test", name: data.payload.name, total: data.payload.courses.length,
        status: "running", message: "Checking selected sections in Workday...", completed: [] } };
      window.postMessage({ channel: data.channel, direction: "response", requestId: data.requestId, response }, location.origin);
    });
  });
  await page.getByRole("button", { name: "Add to Workday", exact: true }).first().click();
  await page.getByLabel("New saved schedule name").fill("Fall plan");
  assert.equal(await page.getByLabel("Academic period", { exact: true }).count(), 0);
  const screenshots = path.join(root, "artifacts", "workday-export");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshots, "mobile.png") });
  const bounds = await page.locator(".workday-export-dialog").boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
  assert.equal(await page.locator(".workday-export-dialog").evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.waitForFunction(() => requests.some(request => request.action === "START"));
  const payload = await page.evaluate(() => requests.find(request => request.action === "START").payload);
  assert.equal(payload.name, "Fall plan");
  assert.equal("term" in payload, false);
  assert.deepEqual(payload.courses.map(course => `${course.code}-${course.section}`).sort(), ["ACCT 2610-01", "ACCT 4013-01"]);
  assert.deepEqual([...new Set(payload.courses.map(course => course.academicPeriod))], ["Fall 2025"]);
  assert(payload.courses.every(course => course.meetings.length === 1));
  assert.equal(await page.getByRole("button", { name: "OK", exact: true }).isVisible(), false);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    const complete = await saverFixture(browser, "success");
    assert.deepEqual(complete.writes, ["create", "add"]);
    assert.deepEqual(complete.filterClicks, ["2025-2026"]);
    assert.equal(complete.job.status, "complete");
    assert.deepEqual(complete.job.completed, ["ACCT 2610-01"]);
    for (const mode of ["stale-pane", "input-loading", "half-term"]) {
      const result = await saverFixture(browser, mode);
      assert.equal(result.job.status, "complete", `${mode}: ${result.job.message}`);
      assert.deepEqual(result.writes, ["create", "add"]);
    }
    const wrongTarget = await saverFixture(browser, "wrong-target");
    assert.equal(wrongTarget.job.status, "paused");
    assert.equal(wrongTarget.job.completed.length, 0);
    assert.equal(wrongTarget.job.writePending.kind, "add");
    for (const mode of ["wrong-term", "stale-times", "pending-write"]) {
      assert.deepEqual((await saverFixture(browser, mode)).writes, [], mode);
    }
    assert.deepEqual((await saverFixture(browser, "extra-section")).writes, ["create"]);
    await siteFixture(browser);
    console.log("Workday export DOM guardrails and responsive dialog tests passed.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
