const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const contentSource = fs
  .readFileSync(path.join(__dirname, "content.js"), "utf8")
  .replace(/<\/script/gi, "<\\/script");

function mockChromeStorage() {
  return `
    <script>
      window.__testStores = { local: {}, sync: { bearPlansAppUrl: "http://127.0.0.1:5001" } };
      window.__storageListeners = [];
      function storageArea(name) {
        return {
          get(defaults, callback) {
            callback(Object.assign({}, defaults, window.__testStores[name]));
          },
          set(values, callback) {
            const changes = {};
            Object.entries(values).forEach(([key, value]) => {
              changes[key] = { oldValue: window.__testStores[name][key], newValue: value };
              window.__testStores[name][key] = value;
            });
            window.__storageListeners.forEach(listener => listener(changes, name));
            if (callback) callback();
          }
        };
      }
      window.chrome = {
        storage: {
          local: storageArea("local"),
          sync: storageArea("sync"),
          onChanged: { addListener(listener) { window.__storageListeners.push(listener); } }
        },
        runtime: {
          lastError: null,
          sendMessage(message, callback) { callback({ ok: false, error: "Not used in capture test" }); }
        }
      };
    </script>`;
}

function runFixture(body, afterLoad, virtualTimeBudget = 2500) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "bearplans-headless-"));
  const fixturePath = path.join(tempDirectory, "fixture.html");
  const profilePath = path.join(tempDirectory, "profile");
  const html = `<!doctype html>
    <html><head><meta charset="utf-8"><style>button{width:120px;height:40px}</style></head>
    <body>${body}${mockChromeStorage()}<script>${contentSource}</script>
    <script>${afterLoad}</script></body></html>`;
  fs.writeFileSync(fixturePath, html);

  const result = spawnSync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profilePath}`,
    "--dump-dom",
    `--virtual-time-budget=${virtualTimeBudget}`,
    `file://${fixturePath}`
  ], { encoding: "utf8", timeout: 30000 });

  fs.rmSync(tempDirectory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const targetDom = runFixture(`
  <nav><button>Find Course Sections</button></nav>
  <main>
    <h1>3700 Results</h1>
    <div role="row" data-result="CSE-01">
      <a href="#cse-01">CSE 1310-01 - Introduction to Computer Science</a>
      <span>Open</span>
      <button class="expand-result" aria-expanded="false" aria-label="Expand CSE 1310-01"></button>
      <div class="result-details" hidden>Meeting Patterns<br>SIMON, Room 00105 | Mon/Wed | 11:30 AM - 12:50 PM</div>
    </div>
    <div role="row" data-result="CSE-02">
      <a href="#cse-02">CSE 1310-02 - Introduction to Computer Science</a>
      <span>Open</span>
      <button class="expand-result" aria-expanded="false" aria-label="Expand CSE 1310-02"></button>
      <div class="result-details" hidden>
        Meeting Patterns<br>
        LOPATA, Room 101 | Tue/Thu | 1:00 PM - 2:20 PM<br>
        SIMON, Room 00105 | Fri | 9:00 AM - 9:50 AM
      </div>
    </div>
    <div role="row" data-result="CSE-03">
      <a href="#cse-03">CSE 1310-03 - Introduction to Computer Science</a>
      <span>Closed</span>
      <button class="expand-result" aria-expanded="false" aria-label="Expand CSE 1310-03"></button>
      <div class="result-details" hidden>Meeting Patterns<br>Fri | 3:00 PM - 3:50 PM</div>
    </div>
    <div role="row" data-result="CHEM-01">
      <a href="#chem-01">CHEM 2501-01 - Organic Chemistry I</a>
      <span>Open</span>
      <button class="expand-result" aria-expanded="false" aria-label="Expand CHEM 2501-01"></button>
      <div class="result-details" hidden>Meeting Patterns<br>Mon/Wed | 1:00 PM - 2:20 PM</div>
    </div>
    <div id="course-dialog" role="dialog" aria-modal="true">
      <h2>View Course Section</h2>
      <h3>CSE 1310-01 - Introduction to Computer Science</h3>
      <section>
        <h4>General Information</h4>
        <div>Instructor<br>Jordan Lee</div>
        <div>Status<br>Open</div>
        <div>Academic Period<br>Fall 2025</div>
        <h4>Additional Details</h4>
        <div>Meeting Patterns<br>SIMON, Room 00105 | Mon/Wed | 11:30 AM - 12:50 PM</div>
      </section>
      <div id="modal-actions"><button>Add to Saved Schedule</button><button>Troubleshoot</button></div>
      <button aria-label="Close">Close</button>
    </div>
  </main>`, `
    document.querySelectorAll(".expand-result").forEach(button => {
      button.addEventListener("click", () => {
        button.setAttribute("aria-expanded", "true");
        button.closest('[role="row"]').querySelector(".result-details").hidden = false;
      });
    });
    setTimeout(() => document.querySelector("#modal-actions .bearplans-workday-add")?.click(), 250);
    setTimeout(() => {
      const stored = window.__testStores.local.bearPlansWorkdaySections || [];
      const result = {
        inlineButton: Boolean(document.querySelector("#modal-actions .bearplans-workday-add")),
        count: stored.length,
        courseCodes: [...new Set(stored.map(section => section.courseCode))],
        sections: [...new Set(stored.map(section => section.section))],
        meetings: stored.map(section => [section.section, section.days, section.startTime, section.endTime]),
        periods: [...new Set(stored.map(section => section.academicPeriod))],
        expanded: [...document.querySelectorAll('.expand-result[aria-expanded="true"]')]
          .map(button => button.closest('[role="row"]').dataset.result),
        panelText: document.querySelector(".bearplans-list")?.innerText || ""
      };
      const output = document.createElement("output");
      output.id = "test-result";
      output.textContent = JSON.stringify(result);
      document.body.appendChild(output);
    }, 1800);
  `);

assert.match(targetDom, /"inlineButton":true/);
assert.match(targetDom, /"count":3/);
assert.match(targetDom, /"courseCodes":\["CSE 1310"\]/);
assert.match(targetDom, /"sections":\["01","02"\]/);
assert.match(targetDom, /\["01","Mon\/Wed","11:30 AM","12:50 PM"\]/);
assert.match(targetDom, /\["02","Tue\/Thu","1:00 PM","2:20 PM"\]/);
assert.match(targetDom, /\["02","Fri","9:00 AM","9:50 AM"\]/);
assert.match(targetDom, /"expanded":\["CSE-02"\]/);
assert.match(targetDom, /"periods":\["Fall 2025"\]/);
assert.match(targetDom, /2 sections/);

const fallbackDom = runFixture(`
  <nav><button>Find Course Sections</button></nav>
  <main id="results">
    <div role="row"><a href="#01" data-section="01">BME 4191-01 - Biomedical Data Science</a><span>Open</span></div>
    <div role="row"><a href="#02" data-section="02">BME 4191-02 - Biomedical Data Science</a><span>Open</span></div>
    <div role="row"><a href="#03" data-section="03">BME 4191-03 - Biomedical Data Science</a><span>Open</span></div>
    <div id="course-dialog" role="dialog" aria-modal="true">
      <h2>View Course Section</h2>
      <h3>BME 4191-01 - Biomedical Data Science</h3>
      <div>General Information</div><div>Status<br>Open</div>
      <div>Academic Period<br>Fall 2025</div>
      <div>Meeting Patterns<br>Mon/Wed | 10:00 AM - 11:20 AM</div>
      <div class="modal-actions"><button>Add to Saved Schedule</button><button>Troubleshoot</button></div>
      <button aria-label="Close">Close</button>
    </div>
  </main>`, `
    const modalMarkup = section => {
      const meetings = {
        "01": "Mon/Wed | 10:00 AM - 11:20 AM",
        "02": "Tue/Thu | 1:00 PM - 2:20 PM<br>Fri | 9:00 AM - 9:50 AM",
        "03": "Tue/Thu | 3:00 PM - 4:20 PM"
      };
      return \`
        <h2>View Course Section</h2>
        <h3>BME 4191-\${section} - Biomedical Data Science</h3>
        <div>General Information</div><div>Status<br>Open</div>
        <div>Academic Period<br>Fall 2025</div>
        <div>Meeting Patterns<br>\${meetings[section]}</div>
        <div class="modal-actions"><button>Add to Saved Schedule</button><button>Troubleshoot</button></div>
        <button aria-label="Close">Close</button>\`;
    };
    const wireClose = dialog => {
      dialog.querySelector('[aria-label="Close"]').addEventListener("click", () => dialog.remove());
    };
    const showDialog = section => {
      document.querySelector("#course-dialog")?.remove();
      const dialog = document.createElement("div");
      dialog.id = "course-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.innerHTML = modalMarkup(section);
      document.querySelector("#results").appendChild(dialog);
      wireClose(dialog);
    };
    wireClose(document.querySelector("#course-dialog"));
    document.querySelectorAll("[data-section]").forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();
        showDialog(link.dataset.section);
      });
    });
    setTimeout(() => document.querySelector(".bearplans-workday-add")?.click(), 250);
    setTimeout(() => {
      const stored = window.__testStores.local.bearPlansWorkdaySections || [];
      const result = {
        count: stored.length,
        sections: [...new Set(stored.map(section => section.section))],
        currentModal: document.querySelector("#course-dialog h3")?.innerText || "",
        meetings: stored.map(section => [section.section, section.days, section.startTime, section.endTime])
      };
      const output = document.createElement("output");
      output.id = "fallback-result";
      output.textContent = JSON.stringify(result);
      document.body.appendChild(output);
    }, 4800);
  `, 5500);

assert.match(fallbackDom, /"count":4/);
assert.match(fallbackDom, /"sections":\["01","02","03"\]/);
assert.match(fallbackDom, /"currentModal":"BME 4191-01 - Biomedical Data Science"/);
assert.match(fallbackDom, /\["02","Tue\/Thu","1:00 PM","2:20 PM"\]/);
assert.match(fallbackDom, /\["02","Fri","9:00 AM","9:50 AM"\]/);

const overviewDom = runFixture(`
  <main>
    <h1>Academics Overview</h1>
    <div>CSE 1310 - Introduction to Computer Science</div>
    <div>Mon/Wed | 11:30 AM - 12:50 PM</div>
  </main>`, `
    setTimeout(() => {
      const output = document.createElement("output");
      output.id = "test-result";
      output.textContent = JSON.stringify({
        inlineButton: Boolean(document.querySelector(".bearplans-workday-add")),
        count: (window.__testStores.local.bearPlansWorkdaySections || []).length
      });
      document.body.appendChild(output);
    }, 800);
  `);

assert.match(overviewDom, /"inlineButton":false/);
assert.match(overviewDom, /"count":0/);

const generationDom = runFixture("<main><h1>Find Course Sections</h1></main>", `
  const messages = [];
  const imported = [
    ...["01", "02", "03", "04", "05", "06"].map(section => ({
      courseCode: "ACCT 2610", courseName: "Principles of Financial Accounting", section,
      academicPeriod: "Fall 2025",
      days: "Mon/Wed", startTime: "9:00 AM", endTime: "9:50 AM"
    })),
    ...["01", "21"].map(section => ({
      courseCode: "ACCT 5005", courseName: "Information Technology Control and Audit", section,
      academicPeriod: "Fall 2025",
      days: "Tue/Thu", startTime: "1:00 PM", endTime: "2:20 PM"
    }))
  ];
  chrome.runtime.sendMessage = (message, callback) => {
    messages.push(message);
    setTimeout(() => callback(messages.length === 1
      ? { ok: false, error: "Server is missing the schedule API (404)." }
      : { ok: true, data: { status: "ok", scheduleCount: 12 } }), 50);
  };
  setTimeout(() => {
    chrome.storage.local.set({ bearPlansWorkdaySections: imported });
    document.querySelector(".bearplans-generate").click();
  }, 200);
  let recovered;
  setTimeout(() => {
    recovered = !document.querySelector(".bearplans-generate").disabled
      && document.querySelector(".bearplans-status").textContent.includes("404")
      && window.__testStores.local.bearPlansWorkdaySections.length === 8;
    chrome.storage.sync.set({ bearPlansAppUrl: "http://127.0.0.1:5002" });
    document.querySelector(".bearplans-generate").click();
  }, 500);
  setTimeout(() => {
    const output = document.createElement("output");
    output.id = "generation-result";
    output.textContent = JSON.stringify({
      recovered,
      messages: messages.length,
      courseCounts: messages.map(message => message.payload.courses.length),
      sectionCounts: messages[1]?.payload.courses.map(course => course.sections.length),
      hasStaleUrl: messages.some(message => "appUrl" in message),
      retained: window.__testStores.local.bearPlansWorkdaySections.length,
      enabled: !document.querySelector(".bearplans-generate").disabled,
      status: document.querySelector(".bearplans-status").textContent
    });
    document.body.appendChild(output);
  }, 900);
`);

assert.match(generationDom, /"recovered":true/);
assert.match(generationDom, /"messages":2/);
assert.match(generationDom, /"courseCounts":\[2,2\]/);
assert.match(generationDom, /"sectionCounts":\[6,2\]/);
assert.match(generationDom, /"hasStaleUrl":false/);
assert.match(generationDom, /"retained":8/);
assert.match(generationDom, /"enabled":true/);
assert.match(generationDom, /Generated 12 schedules and opened BearPlans/);

console.log("Headless Chrome Workday integration tests passed.");
