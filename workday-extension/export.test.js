const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const E = require("./export-common.js");

assert.equal(E.semester("Fall 2026 (08/24/2026-12/16/2026)"), "Fall 2026");
assert.equal(E.semester("Fall Half A 2026"), "Fall 2026");
assert.equal(E.semester("DPT Fall Half A 2026"), "");
assert.equal(E.academicPeriod("bad Fall 2026"), "");
assert.equal(E.academicPeriod("2026-2027 Fall"), "Fall 2026");
assert.equal(E.academicPeriod("DPT Fall Half A 2026"), "");
assert.equal(E.academicYear("Fall 2025"), "2025-2026");
assert.equal(E.academicYear("Spring 2026"), "2025-2026");
assert.equal(E.isWashUUrl("https://www.myworkday.com/wustl/d/home.htmld"), true);
assert.equal(E.isWashUUrl("https://www.myworkday.com/other-school/d/home.htmld"), false);
assert.equal(E.isWashUUrl("https://myworkday.com.attacker.example/wustl/"), false);
assert.deepEqual(E.timeRange("08:30AM-09:50AM"), [510, 590]);
assert.deepEqual(E.timeRange("12:00 AM - 12:00 PM"), [0, 720]);
assert.deepEqual(E.meetingKeys("SIMON | Mon/Wed | 8:30 AM - 9:50 AM\nFri | 1:00 PM - 1:50 PM"), ["----F--|780|830", "M-W----|510|590"]);
const selection = { name: "BearPlans test", courses: [
  { code: "ACCT 2610", section: "01", name: "Financial Accounting", academicPeriod: "Fall 2025", meetings: [{ days: "M-W----", time: "08:30AM-09:50AM" }] },
  { code: "ACCT 4013", section: "01", name: "Ethics I", academicPeriod: "Fall 2025", meetings: [{ days: "-T-R---", time: "02:30PM-03:50PM" }] }
] };
assert.equal(E.validateSelection(selection).courses.length, 2);
assert.equal(E.validateSelection(selection).term, "Fall 2025");
assert.equal(E.validateSelection({ ...selection, courses: [selection.courses[0], selection.courses[0]] }).courses.length, 1);
assert.throws(() => E.validateSelection({ ...selection, name: "" }), /schedule name/);
assert.throws(() => E.validateSelection({ ...selection, courses: [] }), /1 to 30/);
assert.throws(() => E.validateSelection({ ...selection, courses: [{ ...selection.courses[0], meetings: [] }] }), /meeting times/);
assert.equal(E.timeRange("13:00 AM - 2:00 PM"), null);
assert.equal(E.timeRange("9:60 AM - 10:00 AM"), null);
assert.throws(() => E.validateSelection({ ...selection, courses: [selection.courses[0], { ...selection.courses[0], section: "02" }] }), /multiple sections/);
assert.throws(() => E.validateSelection({ ...selection, courses: [selection.courses[0], { ...selection.courses[1], academicPeriod: "Spring 2026" }] }), /same academic period/);
assert.throws(() => E.validateSelection({ ...selection, courses: selection.courses.map(course => ({ ...course, academicPeriod: "Fall 2026" })) }), /2025-2026/);

const local = { bearPlansWorkdaySections: [{ courseCode: "ACCT 2610", section: "01" }] };
const sync = { bearPlansAppUrl: "http://127.0.0.1:5001" };
const listeners = [];
const windows = [];
const navigations = [];
const tabEvents = {};
const sandbox = {
  BearPlansExport: E, URL, console, crypto: { randomUUID },
  normalizeAppUrl(value) {
    const url = new URL(value);
    if (!["localhost", "127.0.0.1", "bearplans.pythonanywhere.com"].includes(url.hostname)) throw new Error("Unsupported host");
    return url.origin;
  },
  chrome: {
    runtime: { onMessage: { addListener(listener) { listeners.push(listener); } } },
    storage: {
      local: { async get() { return { ...local }; }, async set(values) { Object.assign(local, values); } },
      sync: { async get() { return { ...sync }; } }
    },
    tabs: { async update(id, options) { navigations.push({ id, ...options }); },
      onRemoved: { addListener(listener) { tabEvents.removed = listener; } },
      onUpdated: { addListener(listener) { tabEvents.updated = listener; } }
    },
    windows: {
      async create(options) { windows.push(options); return { id: 55, tabs: [{ id: 99 }] }; },
      async update() {}
    }
  }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "export-worker.js"), "utf8"), sandbox);
const site = { url: "http://127.0.0.1:5001/render_timetable/test", tab: { id: 10 }, frameId: 0 };
const workday = { url: "https://www.myworkday.com/wustl/d/home.htmld", tab: { id: 99 }, frameId: 0 };
function send(action, payload = {}, sender = site) {
  return new Promise(resolve => {
    assert.equal(listeners[0]({ type: `BP_EXPORT_${action}`, payload }, sender, resolve), true);
  });
}

(async () => {
  const originalImport = JSON.stringify(local.bearPlansWorkdaySections);
  const untrusted = await send("START", selection, { ...site, url: "https://attacker.example/" });
  assert.equal(untrusted.ok, false);
  assert.equal(windows.length, 0);
  assert.equal((await send("START", selection, { ...site, frameId: 1 })).ok, false);
  const results = await Promise.all([send("START", selection), send("START", selection)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].focused, false);
  assert.equal(navigations[0].url, "https://www.myworkday.com/wustl/d/home.htmld");
  const id = local[E.JOB_KEY].id;
  await tabEvents.updated(99, { url: "https://login.wustl.edu/sign-in" });
  assert.equal(local[E.JOB_KEY].status, "paused");
  assert.equal((await send("OPEN", { id })).job.status, "running");
  await tabEvents.removed(88);
  assert.equal(local[E.JOB_KEY].status, "running");
  assert.equal((await send("POLL", {}, { ...workday, tab: { id: 88 } })).ok, false);
  assert.equal((await send("POLL", {}, { ...workday, frameId: 1 })).ok, false);
  assert.equal((await send("POLL", {}, { ...workday, url: "https://www.myworkday.com/other/" })).ok, false);
  assert.equal((await send("UPDATE", { id, patch: { name: "changed" } }, workday)).ok, false);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "register" }, workday)).ok, false);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "create" }, workday)).ok, false);
  assert.equal((await send("UPDATE", { id, patch: { phase: "create", checked: selection.courses.map(course => ({ section: `${course.code}-${course.section}`, period: "Fall 2025" })) } }, workday)).ok, true);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "create" }, workday)).ok, true);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "create" }, workday)).ok, false);
  assert.equal((await send("RESUME", { id })).ok, false);
  assert.equal((await send("UPDATE", { id, patch: { status: "complete" } }, workday)).ok, false);
  assert.equal((await send("UPDATE", { id, patch: { created: true, writePending: null, status: "running" } }, workday)).ok, true);
  assert.equal((await send("UPDATE", { id, patch: { created: false } }, workday)).ok, false);
  assert.equal((await send("UPDATE", { id, patch: { completed: ["ACCT 2610-01", "ACCT 2610-01"], status: "complete" } }, workday)).ok, false);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "add", course: "ACCT 2610-01" }, workday)).ok, false);
  assert.equal((await send("UPDATE", { id, patch: { scheduleIdentity: "15873$123", phase: "add" } }, workday)).ok, true);
  assert.equal((await send("UPDATE", { id, patch: { scheduleIdentity: "15873$456" } }, workday)).ok, false);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "add", course: "ACCT 2610-02" }, workday)).ok, false);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "add", course: "ACCT 2610-01" }, workday)).ok, true);
  assert.equal(local[E.JOB_KEY].phase, "verify");
  await tabEvents.removed(99);
  assert.equal(local[E.JOB_KEY].status, "paused");
  assert.equal(local[E.JOB_KEY].writePending.course, "ACCT 2610-01");
  assert.equal((await send("RESUME", { id })).ok, true);
  assert.equal(local[E.JOB_KEY].phase, "verify");
  assert.equal((await send("BEFORE_WRITE", { id, kind: "add", course: "ACCT 2610-01" }, workday)).ok, false);
  assert.equal((await send("UPDATE", { id, patch: { completed: ["ACCT 2610-01"], writePending: null, phase: "add", status: "running" } }, workday)).ok, true);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "add", course: "ACCT 2610-01" }, workday)).ok, false);
  assert.equal((await send("BEFORE_WRITE", { id, kind: "create" }, workday)).ok, false);
  assert.equal((await send("CONTEXT")).job.id, id);
  assert.equal((await send("STOP", { id })).job.status, "stopped");
  assert.equal((await send("UPDATE", { id, patch: { status: "running" } }, workday)).ok, false);
  assert.equal((await send("START", selection)).ok, false);
  assert.equal(JSON.stringify(local.bearPlansWorkdaySections), originalImport);
  assert.equal(navigations.some(item => /register|drop|cancel/i.test(item.url || "")), false);
  console.log("Workday export validation and background safety tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
