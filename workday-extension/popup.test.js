const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "popup.js"), "utf8");
const LOCAL = "http://127.0.0.1:5001";
const PUBLIC = "https://bearplans.pythonanywhere.com";
const nodes = Object.fromEntries(["status", "appUrl", "save", "local", "open", "test", "clear"].map(id => [id, {
  value: "", textContent: "", addEventListener(event, listener) { this[event] = listener; }
}]));
const imported = [{ courseCode: "ACCT 2610", section: "01" }, { courseCode: "ACCT 2610", section: "02" }];
const sync = { bearPlansAppUrl: PUBLIC };
const local = { bearPlansWorkdaySections: imported };
const permissionRequests = [];
const openedTabs = [];
let permissionGranted = true;
const runtime = { lastError: null };
function storageArea(store) {
  return {
    get(defaults, callback) { callback({ ...defaults, ...store }); },
    set(values, callback) { if (!runtime.lastError) Object.assign(store, values); callback(); }
  };
}
const sandbox = {
  URL,
  document: { getElementById: id => nodes[id] },
  chrome: {
    runtime,
    storage: { local: storageArea(local), sync: storageArea(sync) },
    permissions: { request(options, callback) { permissionRequests.push(options); callback(permissionGranted); } },
    tabs: { create(options) { openedTabs.push(options); } }
  },
  fetch: async url => {
    assert.equal(url, `${LOCAL}/api/workday/health`);
    return { ok: true, status: 200, json: async () => ({ status: "ok", apiVersion: 1 }) };
  }
};
vm.runInNewContext(source, sandbox, { filename: "popup.js" });

(async () => {
  assert.equal(nodes.appUrl.value, PUBLIC);
  assert.match(nodes.status.textContent, /1 course.*2 sections/);
  nodes.local.click();
  assert.equal(sync.bearPlansAppUrl, LOCAL);
  assert.equal(nodes.appUrl.value, LOCAL);
  assert.equal(permissionRequests[0].origins[0], `${LOCAL}/*`);
  assert.match(nodes.status.textContent, /Server saved: http:\/\/127\.0\.0\.1:5001/);
  assert.equal(local.bearPlansWorkdaySections, imported);
  await nodes.test.click();
  assert.match(nodes.status.textContent, /Connection ready: http:\/\/127\.0\.0\.1:5001/);
  nodes.open.click();
  assert.equal(openedTabs[0].url, LOCAL);

  nodes.appUrl.value = `${PUBLIC}/path`;
  nodes.save.click();
  assert.equal(sync.bearPlansAppUrl, PUBLIC);
  assert.equal(permissionRequests.length, 1);
  permissionGranted = false;
  nodes.local.click();
  assert.equal(sync.bearPlansAppUrl, PUBLIC);
  assert.match(nodes.status.textContent, /not granted/);
  runtime.lastError = { message: "Permission unavailable" };
  nodes.local.click();
  assert.match(nodes.status.textContent, /Local server access failed/);
  assert.equal(sync.bearPlansAppUrl, PUBLIC);
  runtime.lastError = { message: "Storage unavailable" };
  nodes.appUrl.value = PUBLIC;
  nodes.save.click();
  assert.match(nodes.status.textContent, /Could not save server/);
  runtime.lastError = null;
  nodes.appUrl.value = "https://example.com";
  nodes.save.click();
  assert.equal(sync.bearPlansAppUrl, PUBLIC);
  assert.match(nodes.status.textContent, /Use the BearPlans site/);

  nodes.appUrl.value = PUBLIC;
  sandbox.fetch = async () => ({ ok: false, status: 404, json: async () => { throw new Error("HTML"); } });
  await nodes.test.click();
  assert.match(nodes.status.textContent, /bearplans\.pythonanywhere\.com.*missing the BearPlans API \(404\)/);
  sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: "ok", apiVersion: 2 }) });
  await nodes.test.click();
  assert.match(nodes.status.textContent, /not a compatible BearPlans server/);
  assert.equal(local.bearPlansWorkdaySections, imported);
  nodes.clear.click();
  assert.equal(local.bearPlansWorkdaySections.length, 0);
  console.log("Workday popup tests passed (server selection, permissions, health, and retained imports).");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
