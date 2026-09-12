const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
const LOCAL = "http://127.0.0.1:5001";
const PUBLIC = "https://bearplans.pythonanywhere.com";
const payload = { courses: [{ courseCode: "CSE 1310", sections: [] }] };

function harness(useHooks = true) {
  const openedTabs = [];
  const requests = [];
  const settings = {};
  const runtime = { lastError: null, onMessage: { addListener(listener) { this.listener = listener; } } };
  const sandbox = {
    URL,
    console,
    __BEARPLANS_BACKGROUND_TEST_HOOK__: useHooks,
    chrome: {
      runtime,
      storage: { sync: { get(defaults, callback) { callback({ ...defaults, ...settings }); } } },
      tabs: { create: async options => openedTabs.push(options) }
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", redirect: "/render_timetable/test-result", scheduleCount: 4 })
      };
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "background.js" });
  return { api: sandbox.__BEARPLANS_BACKGROUND_TEST_HOOK__, openedTabs, requests, settings, sandbox, runtime };
}

(async () => {
  const { api, openedTabs, requests, settings, sandbox, runtime } = harness();
  assert.equal(api.normalizeAppUrl(`${LOCAL}/path`), LOCAL);
  assert.equal(api.resultUrl(PUBLIC, "/render_timetable/abc"), `${PUBLIC}/render_timetable/abc`);
  assert.throws(() => api.normalizeAppUrl("https://example.com"), /Unsupported BearPlans host/);
  assert.throws(() => api.normalizeAppUrl("ftp://localhost"), /Unsupported BearPlans protocol/);
  assert.throws(() => api.resultUrl(PUBLIC, "https://example.com/result"), /unsafe result URL/);

  const result = await api.openGeneratedSchedules(LOCAL, payload);
  assert.equal(result.scheduleCount, 4);
  assert.equal(requests[0].url, `${LOCAL}/api/workday/generate`);
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.redirect, "error");
  assert.deepEqual(JSON.parse(requests[0].options.body), payload);
  assert.equal(openedTabs[0].url, `${LOCAL}/render_timetable/test-result`);

  await api.generateFromSettings(payload);
  assert.equal(requests.at(-1).url, `${PUBLIC}/api/workday/generate`);
  settings.bearPlansAppUrl = LOCAL;
  await api.generateFromSettings(payload);
  assert.equal(requests.at(-1).url, `${LOCAL}/api/workday/generate`);
  assert.equal(openedTabs.at(-1).url, `${LOCAL}/render_timetable/test-result`);
  settings.bearPlansAppUrl = "http://localhost:5002";
  await api.generateFromSettings(payload);
  assert.equal(requests.at(-1).url, "http://localhost:5002/api/workday/generate");

  // Settings changed mid-flight must not move the result to a different server.
  const originalFetch = sandbox.fetch;
  settings.bearPlansAppUrl = LOCAL;
  sandbox.fetch = async (...args) => {
    settings.bearPlansAppUrl = PUBLIC;
    return originalFetch(...args);
  };
  await api.generateFromSettings(payload);
  assert.equal(openedTabs.at(-1).url, `${LOCAL}/render_timetable/test-result`);

  const tabsBeforeErrors = openedTabs.length;
  sandbox.fetch = async () => ({ ok: false, status: 404, json: async () => { throw new Error("HTML"); } });
  await assert.rejects(api.openGeneratedSchedules(PUBLIC, payload), /bearplans\.pythonanywhere\.com.*missing the schedule API \(404\).*Connection settings/);
  sandbox.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: "No usable courses." }) });
  await assert.rejects(api.openGeneratedSchedules(LOCAL, payload), /No usable courses/);
  sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error("HTML"); } });
  await assert.rejects(api.openGeneratedSchedules(LOCAL, payload), /127\.0\.0\.1:5001.*invalid response/);
  sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  await assert.rejects(api.openGeneratedSchedules(LOCAL, payload), /did not return a schedule page/);
  sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ({ redirect: "https://example.com/result" }) });
  await assert.rejects(api.openGeneratedSchedules(LOCAL, payload), /unsafe result URL/);
  sandbox.fetch = async () => { throw new Error("Failed to fetch"); };
  await assert.rejects(api.openGeneratedSchedules(LOCAL, payload), /Cannot reach http:\/\/127\.0\.0\.1:5001/);
  assert.equal(openedTabs.length, tabsBeforeErrors);

  sandbox.fetch = originalFetch;
  const requestsBeforeErrors = requests.length;
  runtime.lastError = { message: "Storage unavailable" };
  await assert.rejects(api.generateFromSettings(payload), /Could not read.*Storage unavailable/);
  runtime.lastError = null;
  settings.bearPlansAppUrl = "https://example.com";
  await assert.rejects(api.generateFromSettings(payload), /Unsupported BearPlans host/);
  assert.equal(requests.length, requestsBeforeErrors);

  // Exercise the real message handler with a stale URL from an older content script.
  const worker = harness(false);
  worker.settings.bearPlansAppUrl = LOCAL;
  const reply = await new Promise(resolve => {
    assert.equal(worker.runtime.onMessage.listener({
      type: "BEARPLANS_GENERATE", appUrl: PUBLIC, payload
    }, {}, resolve), true);
  });
  assert.equal(reply.ok, true);
  assert.equal(worker.requests[0].url, `${LOCAL}/api/workday/generate`);
  assert.equal(worker.openedTabs[0].url, `${LOCAL}/render_timetable/test-result`);
  assert.equal(worker.runtime.onMessage.listener({ type: "UNKNOWN" }, {}, () => {}), false);
  console.log("Workday background worker tests passed (saved server, stale tabs, errors, and redirects).");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
