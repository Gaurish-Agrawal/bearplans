(() => {
  const E = BearPlansExport;
  let queue = Promise.resolve();
  const serialize = task => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };
  async function readJob() { return (await chrome.storage.local.get(E.JOB_KEY))[E.JOB_KEY] || null; }
  async function writeJob(job) {
    job.updatedAt = Date.now();
    await chrome.storage.local.set({ [E.JOB_KEY]: job });
    return job;
  }
  async function requireSite(sender) {
    const settings = await chrome.storage.sync.get({ bearPlansAppUrl: "https://bearplans.pythonanywhere.com" });
    if (!sender.tab || sender.frameId !== 0 || new URL(sender.url).origin !== normalizeAppUrl(settings.bearPlansAppUrl)) {
      throw new Error("Start this save from your selected BearPlans site.");
    }
  }
  function requireWorkday(sender, job) {
    if (!job || sender.tab?.id !== job.workdayTabId || !E.isWashUUrl(sender.url) || sender.frameId !== 0) {
      throw new Error("This Workday tab is not assigned to the saved-schedule task.");
    }
  }
  async function handle(message, sender) {
    const action = message.type.replace(/^BP_EXPORT_/, "");
    const input = message.payload || {};
    if (["POLL", "UPDATE", "BEFORE_WRITE"].includes(action)) {
      const job = await readJob();
      requireWorkday(sender, job);
      if (action === "POLL") return { job: E.ACTIVE.has(job.status) ? job : null };
      if (input.id !== job.id || !E.ACTIVE.has(job.status)) throw new Error("This save has stopped.");
      if (action === "BEFORE_WRITE") {
        if (job.status !== "running") throw new Error("This save is not running.");
        if (job.writePending) throw new Error("A previous save has not been verified. No duplicate write was attempted.");
        if (!["create", "add"].includes(input.kind)) throw new Error("Unsupported Workday action.");
        if (!job.term || E.academicYear(job.term) !== E.TARGET_ACADEMIC_YEAR) {
          throw new Error("The academic period was not verified in Workday.");
        }
        const expected = job.courses.map(course => `${course.code}-${course.section}`);
        if (job.checked.length !== expected.length || !expected.every(section => job.checked.some(item => item.section === section
          && E.semester(item.period) === job.term))) {
          throw new Error("Every section must be checked before saving.");
        }
        if (input.kind === "create" && job.created) throw new Error("The new schedule has already been created.");
        if (input.kind === "create" && job.phase !== "create") throw new Error("This save is not ready to create a schedule.");
        if (input.kind === "add" && (!job.created || !/^15873\$\d+$/.test(job.scheduleIdentity || "") || job.phase !== "add"
          || !expected.includes(input.course) || job.completed.includes(input.course))) {
          throw new Error("This section cannot be submitted to the new saved schedule.");
        }
        job.writePending = { kind: input.kind, course: input.course, startedAt: Date.now() };
        job.status = "writing";
        if (input.kind === "add") job.phase = "verify";
      } else {
        const allowed = ["phase", "index", "checked", "completed", "created", "scheduleIdentity", "message", "status", "writePending", "term"];
        for (const key of Object.keys(input.patch || {})) {
          if (!allowed.includes(key)) throw new Error("Unsupported saved-schedule update.");
        }
        const patch = input.patch || {};
        if ("term" in patch) {
          const term = E.academicPeriod(patch.term);
          if (!term || E.academicYear(term) !== E.TARGET_ACADEMIC_YEAR) throw new Error("Invalid Workday academic period.");
          if (job.term && job.term !== term) throw new Error("The Workday academic period cannot change.");
          patch.term = term;
        }
        if (patch.status && !["running", "writing", "paused", "complete"].includes(patch.status)) throw new Error("Invalid save status.");
        if (patch.created === false && job.created) throw new Error("The created schedule cannot be forgotten.");
        if (patch.scheduleIdentity && job.scheduleIdentity && patch.scheduleIdentity !== job.scheduleIdentity) throw new Error("The target schedule cannot change.");
        if ("writePending" in patch && patch.writePending !== null) throw new Error("Writes require a separate checkpoint.");
        const completed = patch.completed || job.completed;
        const expected = job.courses.map(course => `${course.code}-${course.section}`);
        if (!Array.isArray(completed) || new Set(completed).size !== completed.length || completed.some(section => !expected.includes(section))
          || !job.completed.every(section => completed.includes(section))) throw new Error("Invalid verified-section list.");
        if (patch.status === "complete" && (!job.created || patch.writePending || job.writePending && patch.writePending !== null
          || completed.length !== expected.length)) {
          throw new Error("Not every section has been verified in Workday.");
        }
        Object.assign(job, input.patch);
      }
      await writeJob(job);
      return { job };
    }

    await requireSite(sender);
    if (action === "CONTEXT") {
      const active = await readJob();
      return { job: active && E.ACTIVE.has(active.status)
        && active.sourceOrigin === new URL(sender.url).origin ? E.publicJob(active) : null };
    }
    let job = await readJob();
    if (action === "START") {
      const selection = E.validateSelection(input);
      if (job && E.ACTIVE.has(job.status)) throw new Error("A Workday save is already in progress. Finish or stop it before starting another.");
      if (job?.name === selection.name && job.term === selection.term && job.created) {
        throw new Error("That name was already used by the previous save. Choose a new name to avoid duplicates.");
      }
      const workdayWindow = await chrome.windows.create({ url: "about:blank", focused: false, type: "normal", left: 0, top: 30, width: 1180, height: 850 });
      const tab = workdayWindow.tabs[0];
      job = {
        ...selection, id: crypto.randomUUID(), sourceOrigin: new URL(sender.url).origin,
        sourceTabId: sender.tab.id, workdayTabId: tab.id, workdayWindowId: workdayWindow.id, status: "running", phase: "navigate",
        index: 0, checked: [], completed: [], created: false, writePending: null,
        message: `Opening Workday and preparing the ${E.TARGET_ACADEMIC_YEAR} course search...`, createdAt: Date.now()
      };
      await writeJob(job);
      await chrome.tabs.update(tab.id, { url: "https://www.myworkday.com/wustl/d/home.htmld" });
      return { job: E.publicJob(job) };
    }
    if (!job || job.id !== input.id || job.sourceOrigin !== new URL(sender.url).origin) {
      throw new Error("This Workday save is no longer available.");
    }
    if (action === "STATUS") return { job: E.publicJob(job) };
    if (action === "OPEN") {
      await chrome.tabs.update(job.workdayTabId, { active: true });
      await chrome.windows.update(job.workdayWindowId, { focused: true });
      if (job.status === "paused" && (!job.writePending || job.writePending.kind === "add")) {
        job.status = "running";
        if (job.writePending) job.phase = "verify";
        job.message = "Continuing in Workday...";
        await writeJob(job);
      }
      return { job: E.publicJob(job) };
    }
    if (action === "STOP") {
      job.status = "stopped";
      job.message = job.created || job.writePending
        ? `Stopped. Check "${job.name}" in Workday; it may contain a partial set of sections. No existing schedule was changed.`
        : "Stopped before creating a saved schedule.";
      await writeJob(job);
      return { job: E.publicJob(job) };
    }
    if (action === "RESUME") {
      if (job.writePending && job.writePending.kind !== "add") throw new Error("Schedule creation could not be verified. Check Saved Schedules in Workday before starting a new save.");
      if (job.status !== "paused") throw new Error("This save is not paused.");
      job.status = "running";
      if (job.writePending) job.phase = "verify";
      job.message = "Continuing in Workday...";
      await writeJob(job);
      return { job: E.publicJob(job) };
    }
    throw new Error("Unsupported saved-schedule request.");
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type?.startsWith("BP_EXPORT_")) return false;
    serialize(() => handle(message, sender)).then(
      result => sendResponse({ ok: true, ...result }),
      error => sendResponse({ ok: false, error: error.message })
    );
    return true;
  });

  chrome.tabs.onRemoved?.addListener(tabId => serialize(async () => {
    const job = await readJob();
    if (job?.workdayTabId !== tabId || !E.ACTIVE.has(job.status)) return;
    job.status = "paused";
    job.message = job.writePending
      ? `Workday closed before the save was verified. Check "${job.name}" before trying again.`
      : "The Workday window was closed. Stop this task before starting another save.";
    await writeJob(job);
  }));
  chrome.tabs.onUpdated?.addListener((tabId, change) => serialize(async () => {
    if (!change.url || change.url === "about:blank") return;
    const job = await readJob();
    if (job?.workdayTabId !== tabId || !E.ACTIVE.has(job.status) || E.isWashUUrl(change.url)) return;
    job.status = "paused";
    job.message = "Sign in through Workday's window, then press Continue in BearPlans. BearPlans never handles your password or sign-in code.";
    await writeJob(job);
  }));
})();
