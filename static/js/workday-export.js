(() => {
  const schedules = JSON.parse(document.getElementById("workday-export-schedules").textContent);
  const channel = "bearplans-workday-export";
  const pending = new Map();
  let chosenIndex = 0;
  let jobId = null;
  let timer = null;
  let starting = false;
  const dialog = document.createElement("dialog");
  dialog.className = "workday-export-dialog";
  dialog.setAttribute("aria-labelledby", "workday-export-title");
  dialog.innerHTML = `<form>
    <h2 id="workday-export-title">Add to Workday</h2>
    <div data-export-fields>
      <label for="workday-schedule-name">New saved schedule name</label>
      <input id="workday-schedule-name" name="name" maxlength="80" required autocomplete="off">
      <ul data-export-courses></ul>
      <p>Saved schedule only. No registration changes.</p>
    </div>
    <p data-export-message role="status" aria-live="polite"></p>
    <div class="workday-export-actions">
      <button type="button" data-export-open hidden>Open Workday</button>
      <button type="button" data-export-resume hidden>Continue</button>
      <button type="button" data-export-stop hidden>Stop</button>
      <button type="button" data-export-close>Cancel</button>
      <button type="submit">OK</button>
    </div>
  </form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector("form");
  const message = dialog.querySelector("[data-export-message]");
  const submit = dialog.querySelector('[type="submit"]');

  function request(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Open BearPlans in Chrome with the updated extension enabled, then refresh this page."));
      }, 8000);
      pending.set(requestId, { resolve, reject, timeout });
      window.postMessage({ channel, direction: "request", requestId, action, payload }, location.origin);
    });
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== channel
      || event.data.direction !== "response") return;
    const item = pending.get(event.data.requestId);
    if (!item) return;
    pending.delete(event.data.requestId);
    clearTimeout(item.timeout);
    if (event.data.response?.ok) item.resolve(event.data.response);
    else item.reject(new Error(event.data.response?.error || "The extension could not start this save."));
  });

  function selectedCourses(index) {
    const seen = new Map();
    for (const [key, course] of Object.entries(schedules[index] || {})) {
      const code = String(course.code || "").trim();
      const section = String(course.subsection || "").trim();
      if (seen.has(code) && seen.get(code).section !== section) throw new Error(`Multiple sections of ${code} are selected.`);
      if (!seen.has(code)) seen.set(code, {
        code,
        section,
        name: course.displayName || key,
        academicPeriod: String(course.academicPeriod || "").trim(),
        meetings: []
      });
      if (seen.get(code).academicPeriod && course.academicPeriod
        && seen.get(code).academicPeriod !== String(course.academicPeriod).trim()) {
        throw new Error(`The selected meetings for ${code} are from different academic periods.`);
      }
      if (!seen.get(code).academicPeriod && course.academicPeriod) {
        seen.get(code).academicPeriod = String(course.academicPeriod).trim();
      }
      seen.get(code).meetings.push({ days: course.days, time: course.timestring });
    }
    return [...seen.values()];
  }

  function showJob(job) {
    if (!job) throw new Error("This Workday save is no longer available.");
    jobId = job.id;
    const active = ["running", "paused", "writing"].includes(job.status);
    const status = job.status === "complete"
      ? `Saved "${job.name}" in Workday with ${job.total} course sections.`
      : job.message;
    message.textContent = status;
    document.querySelectorAll("[data-workday-export-status]").forEach(element => { element.textContent = status; });
    dialog.querySelector("[data-export-fields]").hidden = true;
    submit.hidden = true;
    dialog.querySelector("[data-export-close]").textContent = "Close";
    dialog.querySelector("[data-export-open]").hidden = false;
    dialog.querySelector("[data-export-resume]").hidden = job.status !== "paused";
    dialog.querySelector("[data-export-stop]").hidden = !active;
    clearTimeout(timer);
    timer = null;
    if (active) {
      timer = setTimeout(poll, 2500);
    }
  }

  async function poll() {
    try { showJob((await request("STATUS", { id: jobId })).job); }
    catch (error) { message.textContent = error.message; }
  }

  async function open(index) {
    chosenIndex = index;
    message.textContent = "";
    if (jobId) {
      dialog.showModal();
      await poll();
      return;
    }
    dialog.querySelector("[data-export-fields]").hidden = false;
    submit.hidden = false;
    dialog.querySelector("[data-export-open]").hidden = true;
    dialog.querySelector("[data-export-resume]").hidden = true;
    dialog.querySelector("[data-export-stop]").hidden = true;
    dialog.querySelector("[data-export-close]").textContent = "Cancel";
    const list = dialog.querySelector("[data-export-courses]");
    list.replaceChildren();
    try {
      for (const course of selectedCourses(index)) {
        const item = document.createElement("li");
        item.textContent = `${course.code}-${course.section} ${course.name}`;
        list.appendChild(item);
      }
      dialog.showModal();
      const context = await request("CONTEXT");
      if (context.job) { showJob(context.job); return; }
    } catch (error) { message.textContent = error.message; }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (starting || !form.reportValidity()) return;
    starting = true;
    submit.disabled = true;
    message.textContent = "Opening Workday...";
    try {
      const response = await request("START", {
        name: form.elements.name.value,
        courses: selectedCourses(chosenIndex)
      });
      showJob(response.job);
    } catch (error) { message.textContent = error.message; }
    finally { starting = false; submit.disabled = false; }
  });
  dialog.querySelector("[data-export-close]").addEventListener("click", () => {
    dialog.close();
    if (!timer) jobId = null;
  });
  for (const [selector, action] of [["open", "OPEN"], ["stop", "STOP"], ["resume", "OPEN"]]) {
    dialog.querySelector(`[data-export-${selector}]`).addEventListener("click", async () => {
      try {
        const response = await request(action, { id: jobId });
        if (response.job) showJob(response.job);
      } catch (error) { message.textContent = error.message; }
    });
  }
  window.BearPlansWorkday = { open };
  request("CONTEXT").then(context => {
    if (context.job && !starting) showJob(context.job);
  }).catch(() => {});
})();
