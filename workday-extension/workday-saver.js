(() => {
  if (window.top !== window || window.__bearPlansWorkdaySaver) return;
  window.__bearPlansWorkdaySaver = true;
  const E = BearPlansExport;
  const visible = element => {
    if (!(element instanceof Element) || !element.getClientRects().length || getComputedStyle(element).visibility === "hidden") return false;
    const hidden = element.closest('[aria-hidden="true"]');
    if (!hidden) return true;
    // Workday can leave its rendered reading pane aria-hidden after closing a course modal.
    return hidden.id === "workdayApplicationFrame" && ![...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[data-automation-id="popUpDialog"]')]
      .some(root => root.getClientRects().length && getComputedStyle(root).visibility !== "hidden");
  };
  const controls = (root = document) => [...root.querySelectorAll('button,a,[role="button"],[role="link"],[role="option"],input[type="button"]')].filter(visible);
  const exact = (name, root = document) => controls(root).find(element => [element.innerText, element.getAttribute("aria-label"), element.title]
    .some(value => E.text(value).toLowerCase() === name.toLowerCase()));
  const headings = () => [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible).map(element => E.text(element.innerText));
  let job = null;
  let running = false;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const dialogs = () => [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const dialogTitle = root => E.text(root?.querySelector('[data-automation-id="pageHeaderTitleText"],h1,h2')?.innerText);
  const dialog = title => dialogs().findLast(root => dialogTitle(root) === title);
  const CREATE = "Create Student Registration Saved Schedule";
  const ADD = "Add Course Section to Saved Schedule";
  const VIEW = "View Course Section";
  const SAVED = "View Student Registration Saved Schedule";
  const safeActions = new Set(["More", "Student Self-Service", "Academics Hub", "Planning and Registration", "Find Course Sections",
    "Not Now", "Close", "Add to Saved Schedule", "Choose Times", "OK", "Done"]);

  function fieldRoot(name, root = document) {
    const fieldLabel = [...root.querySelectorAll('[data-automation-id="formLabel"],label')]
      .find(element => E.text(element.innerText) === name && visible(element));
    if (!fieldLabel) return null;
    const row = fieldLabel.closest("li") || fieldLabel.parentElement;
    return row.querySelector('[data-automation-id="decorationWrapper"]') || row;
  }
  const fieldText = (name, root) => E.text(fieldRoot(name, root)?.innerText);
  const fieldInput = (name, root) => fieldRoot(name, root)?.querySelector('input:not([type="checkbox"]),textarea');
  const inputReady = input => input && visible(input) && !input.disabled && !input.readOnly;
  const pageBusy = () => [...document.querySelectorAll('[data-automation-facet-loading="true"],[data-automation-id="wd-LoadingPanel"]')].some(visible);
  const periodText = root => E.text(fieldRoot("Academic Period", root)?.querySelector('[data-automation-id="promptOption"]')?.innerText)
    || fieldText("Academic Period", root);
  function setInput(input, value) {
    if (!input || input.disabled || input.readOnly) throw new Error("The expected Workday input is unavailable.");
    const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function send(action, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type: `BP_EXPORT_${action}`, payload });
    if (!response?.ok) throw new Error(response?.error || "The extension could not continue this save.");
    return response.job;
  }
  async function update(patch) {
    job = await send("UPDATE", { id: job.id, patch });
    return job;
  }
  function assertRunning() {
    if (!job || !["running", "writing"].includes(job.status)) throw new Error("The save has stopped or paused.");
  }
  async function waitFor(check, message, timeout = 60000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      assertRunning();
      if (exact("Not Now") && headings().includes("Your Session Has Been Recovered")) press("Not Now");
      const value = check();
      if (value) return value;
      if (document.hidden) throw new Error("Open the Workday window, then Continue. Workday pauses forms while its window is hidden.");
      await delay(250);
    }
    throw new Error(document.hidden ? "Open the Workday window, then Continue. Workday paused while its tab was hidden." : message);
  }
  function press(name, root = document) {
    assertRunning();
    if (!safeActions.has(name)) throw new Error("This Workday action is not permitted by the saved-schedule exporter.");
    const element = exact(name, root);
    if (!element || element.disabled || element.getAttribute("aria-disabled") === "true") throw new Error(`Workday's ${name} action is unavailable.`);
    element.click();
  }
  function sectionElements(course, root = document) {
    return [...root.querySelectorAll('[data-automation-id="promptOption"],a,[role="link"]')]
      .filter(element => visible(element) && E.text(element.innerText).startsWith(`${course.code}-${course.section} - `));
  }
  function sectionElement(course, root = document) {
    return sectionElements(course, root)[0];
  }
  function verifySection(root, course) {
    if (!root || dialogTitle(root) !== VIEW || !sectionElement(course, root)) throw new Error(`Workday did not open ${course.code}-${course.section}.`);
    const period = E.semester(periodText(root));
    if (!period || E.academicYear(period) !== E.TARGET_ACADEMIC_YEAR) {
      throw new Error(`${course.code}-${course.section} is not in the ${E.TARGET_ACADEMIC_YEAR} academic year.`);
    }
    if (course.academicPeriod && period !== course.academicPeriod) throw new Error(`${course.code}-${course.section} is not in ${course.academicPeriod}.`);
    if (job.term && period !== job.term) throw new Error(`${course.code}-${course.section} is not in ${job.term}.`);
    if (/^(Closed|Cancelled|Canceled)$/i.test(fieldText("Status", root))) throw new Error(`${course.code}-${course.section} is no longer available.`);
    if (course.meetings.length) {
      const expected = [...new Set(course.meetings.map(meeting => {
        const range = E.timeRange(meeting.time);
        if (!range) throw new Error(`The generated meeting time for ${course.code} is invalid.`);
        return `${meeting.days.padEnd(7, "-")}|${range.join("|")}`;
      }))].sort();
      const actual = E.meetingKeys(fieldRoot("Meeting Patterns", root)?.innerText);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`${course.code}-${course.section} has different meeting times in Workday. Regenerate the schedule before saving.`);
    }
    return true;
  }
  async function closeCourse() {
    const root = dialog(VIEW);
    if (!root) return;
    if (dialogs().at(-1) !== root) throw new Error("An unexpected Workday form is open. No further action was taken.");
    press("Close", root);
    await waitFor(() => !dialog(VIEW), "Workday did not close the course details.");
  }
  const searchInput = () => document.querySelector('#wd-AdvancedFacetedSearch-SearchTextBox-input')
    || [...document.querySelectorAll('input')].find(element => visible(element) && /Find Course Sections/i.test(element.getAttribute("aria-label") || ""));

  async function navigate() {
    await waitFor(() => searchInput() || exact("Student Self-Service") || exact("Academics Hub")
      || exact("Planning and Registration") || exact("Find Course Sections") || exact("Not Now") || exact("More"),
    "Sign in to Workday, then press Continue in BearPlans.", 45000);
    if (exact("Not Now") && headings().includes("Your Session Has Been Recovered")) press("Not Now");
    if (searchInput()) return;
    if (!exact("Student Self-Service") && !exact("Academics Hub") && exact("More")) {
      press("More");
      await waitFor(() => exact("Student Self-Service"), "Open Student Self-Service from Workday's navigation, then Continue.");
    }
    if (exact("Student Self-Service") && !exact("Academics Hub")) {
      press("Student Self-Service");
      await waitFor(() => exact("Academics Hub"), "Open Student Self-Service > Academics Hub in the Workday window, then Continue.");
    }
    if (exact("Academics Hub")) {
      press("Academics Hub");
      await waitFor(() => exact("Planning and Registration") || exact("Find Course Sections"), "Workday did not open Academics Hub.");
    }
    if (!exact("Find Course Sections") && exact("Planning and Registration")) {
      press("Planning and Registration");
      await waitFor(() => exact("Find Course Sections"), "Workday did not open Planning and Registration.");
    }
    if (exact("Find Course Sections")) press("Find Course Sections");
    await waitFor(searchInput, "Sign in if needed, then open Find Course Sections and press Continue in BearPlans.");
  }

  async function filters() {
    const boxes = () => [...document.querySelectorAll('[data-automation-id="checkbox"]')].filter(visible);
    const yearBox = boxes().find(element => element.title === E.TARGET_ACADEMIC_YEAR)?.querySelector("input");
    if (!yearBox) throw new Error(`Open Academic Year in Workday so ${E.TARGET_ACADEMIC_YEAR} is visible, then Continue.`);
    if (!yearBox.checked) {
      yearBox.click();
      await waitFor(() => boxes().find(element => element.title === E.TARGET_ACADEMIC_YEAR)?.querySelector("input")?.checked && !pageBusy(),
        `Workday did not select the ${E.TARGET_ACADEMIC_YEAR} academic year.`);
    }
  }

  async function openSection(course) {
    const existing = dialog(VIEW);
    if (existing && dialogs().at(-1) === existing && sectionElement(course, existing)) {
      verifySection(existing, course);
      return existing;
    }
    if (existing) await closeCourse();
    await navigate();
    const input = searchInput();
    if (!input || dialogs().length) throw new Error("Return to Find Course Sections in the Workday window, then Continue.");
    await filters();
    const ready = await waitFor(() => !pageBusy() && inputReady(searchInput()) && searchInput(), "Workday's course search is still loading. Open Workday to continue.");
    setInput(ready, course.code);
    const button = document.querySelector('[data-automation-id="advancedSearchButton"]') || exact("Search", input.closest('[role="search"]') || document);
    if (!button) throw new Error("The course search button is unavailable.");
    button.click();
    await delay(1500);
    const links = await waitFor(() => {
      if (pageBusy()) return null;
      const matches = sectionElements(course).filter(element => !element.closest('[role="dialog"]'));
      return matches.length ? matches : null;
    }, `Could not find ${course.code}-${course.section} in the ${E.TARGET_ACADEMIC_YEAR} academic year.`);
    for (const link of links) {
      link.click();
      const root = await waitFor(() => {
        const current = dialog(VIEW);
        return current && sectionElement(course, current) && fieldText("Academic Period", current) && current;
      }, `Workday did not load ${course.code}-${course.section}.`, 20000);
      const period = E.semester(periodText(root));
      if (period && E.academicYear(period) === E.TARGET_ACADEMIC_YEAR
        && (!course.academicPeriod || period === course.academicPeriod)
        && (!job.term || period === job.term)) {
        verifySection(root, course);
        return root;
      }
      await closeCourse();
    }
    throw new Error(`Could not find the exact ${course.code}-${course.section} academic period in Workday.`);
  }

  async function openAdd(course) {
    const root = await openSection(course);
    await waitFor(() => exact("Add to Saved Schedule", root), "Workday did not enable Add to Saved Schedule for this section.");
    press("Add to Saved Schedule", root);
    return waitFor(() => {
      const form = dialog(ADD);
      return form && fieldInput("Saved Schedule", form) && form;
    }, "Workday did not open Add Course Section to Saved Schedule.");
  }
  function selectedIdentity(root) {
    const field = fieldRoot("Saved Schedule", root);
    const item = field?.querySelector('[data-automation-id="selectedItem"], [data-automation-id^="selectedItem_"]');
    return item?.id?.startsWith("pill-") ? item.id.slice(5)
      : item?.getAttribute("data-automation-id")?.replace(/^selectedItem_/, "") || "";
  }
  function formError(root) {
    return [...root.querySelectorAll('[aria-invalid="true"],[data-automation-id="errorMessage"],[data-automation-id="errorLabel"]')]
      .filter(visible).map(element => E.text(element.getAttribute("aria-label") || element.innerText)).filter(Boolean).join(" ");
  }

  async function createSchedule() {
    let newForm = dialog(CREATE);
    if (!newForm) {
      const anchor = job.checked.findIndex(item => item.period === job.term);
      const course = job.courses[Math.max(anchor, 0)];
      const form = dialog(ADD) || await openAdd(course);
      if (!sectionElement(course, form) || selectedIdentity(form)) throw new Error("An unexpected Workday save form is open. Nothing was created.");
      fieldInput("Saved Schedule", form).click();
      const create = await waitFor(() => [...document.querySelectorAll('[data-automation-id="promptOption"]')]
        .find(element => visible(element) && E.text(element.innerText) === CREATE), "Workday did not offer Create New Saved Schedule.");
      create.click();
      newForm = await waitFor(() => {
        const root = dialog(CREATE);
        return root && fieldInput("Saved Schedule Name", root) && root;
      }, "Workday did not load the new saved-schedule name field.");
    }
    if (E.academicPeriod(periodText(newForm)) !== job.term) {
      const period = fieldRoot("Academic Period", newForm);
      const clear = period?.querySelector('[data-automation-id="DELETE_charm"]');
      const input = fieldInput("Academic Period", newForm);
      if (!clear || !input) throw new Error("Workday did not provide the imported courses' academic period. Nothing was created.");
      clear.click();
      input.click();
      setInput(input, job.term);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      const option = await waitFor(() => [...document.querySelectorAll('[data-automation-id="promptLeafNode"]')]
        .find(element => visible(element) && E.text(element.innerText) === job.term), `Workday did not offer ${job.term} for the new saved schedule. Nothing was created.`);
      option.click();
      await waitFor(() => E.academicPeriod(periodText(newForm)) === job.term, "Workday did not select the requested academic period.");
    }
    const nameInput = await waitFor(() => inputReady(fieldInput("Saved Schedule Name", newForm)) && fieldInput("Saved Schedule Name", newForm), "Workday has not enabled the schedule name field.");
    setInput(nameInput, job.name);
    job = await send("BEFORE_WRITE", { id: job.id, kind: "create" });
    press("OK", newForm);
    const returned = await waitFor(() => {
      const error = dialog(CREATE) && formError(dialog(CREATE));
      if (error) throw new Error(error);
      const root = dialog(ADD);
      return root && fieldText("Saved Schedule", root).includes(job.name) && root;
    }, "Workday did not confirm creation. Check Saved Schedules before trying again.");
    const identity = selectedIdentity(returned);
    if (!/^15873\$\d+$/.test(identity)) throw new Error("The new saved schedule's identity could not be verified. Check Workday before trying again.");
    await update({ created: true, scheduleIdentity: identity, writePending: null, status: "running", phase: "add", index: 0,
      message: `Created "${job.name}". Adding the selected sections...` });
  }

  function addOrder() {
    const anchor = Math.max(0, job.checked.findIndex(item => item.period === job.term));
    return [anchor, ...job.courses.map((_, index) => index).filter(index => index !== anchor)];
  }
  function verifyTarget(root) {
    if (!job.created || !job.scheduleIdentity || selectedIdentity(root) !== job.scheduleIdentity) {
      throw new Error("Workday did not select the newly created saved schedule. Nothing was added.");
    }
    const name = fieldText("Saved Schedule Name", root);
    if (name && name !== job.name) throw new Error("The saved schedule name changed. Nothing was added.");
  }
  async function selectTarget(form) {
    if (selectedIdentity(form) === job.scheduleIdentity) return;
    if (selectedIdentity(form)) throw new Error("An unexpected saved schedule is selected. Nothing was added.");
    fieldInput("Saved Schedule", form).click();
    const leaves = () => [...document.querySelectorAll('[data-automation-id="promptLeafNode"]')].filter(visible);
    const all = await waitFor(() => leaves().find(element => E.text(element.innerText) === "All"), "The saved-schedule list is unavailable.");
    all.click();
    const option = await waitFor(() => leaves().find(element => element.getAttribute("data-uxi-multiselectlistitem-instanceid") === job.scheduleIdentity),
      `Workday does not offer "${job.name}" for this course. No other schedule was selected.`);
    if (E.text(option.innerText) !== job.name) throw new Error("The new saved schedule was renamed. Nothing was added.");
    option.click();
    await waitFor(() => selectedIdentity(form) === job.scheduleIdentity, "Workday did not select the new saved schedule.");
  }
  function verifyTimes(root, course) {
    verifyTarget(root);
    verifySchedulePeriod(root);
    const rows = [...root.querySelectorAll('tr,[role="row"]')].filter(element => visible(element) && element.querySelector('input[type="checkbox"]:not(:disabled)'));
    const chosen = rows.filter(row => sectionElement(course, row));
    if (chosen.length !== 1) throw new Error(`Workday did not offer exactly one ${course.code}-${course.section} selection.`);
    const selected = rows.filter(row => row.querySelector('input[type="checkbox"]:not(:disabled)')?.checked);
    if (selected.length !== 1 || selected[0] !== chosen[0]) throw new Error("Workday selected different or additional sections. Nothing was added.");
    const expected = [...new Set(course.meetings.map(meeting => `${meeting.days.padEnd(7, "-")}|${E.timeRange(meeting.time)?.join("|")}`))].sort();
    if (JSON.stringify(E.meetingKeys(chosen[0].innerText)) !== JSON.stringify(expected)) throw new Error("The selected section's meeting times changed. Nothing was added.");
  }
  function verifySchedulePeriod(root) {
    const field = fieldRoot("Academic Periods", root) || fieldRoot("Academic Period", root);
    const labels = [...(field?.querySelectorAll('[data-automation-id="promptOption"]') || [])].map(element => E.text(element.innerText));
    const periods = labels.length ? labels : [E.text(field?.innerText)];
    if (!periods.includes(job.term) || periods.some(period => E.semester(period) !== job.term)) {
      throw new Error("The saved schedule is for the wrong academic period.");
    }
  }
  function savedResult() {
    const form = dialog(ADD);
    if (form && exact("Done", form) && fieldText("Saved Schedule Name", form)) return form;
    if (headings().includes(SAVED) && !dialogs().length && fieldText("Saved Schedule Name", document)) return document;
    return null;
  }
  async function verifySaved() {
    if (job.writePending?.kind !== "add" || !job.created || !/^15873\$\d+$/.test(job.scheduleIdentity || "")) {
      throw new Error("There is no verifiable section addition to continue.");
    }
    let root = savedResult();
    if (!root) {
      // Workday's read-only saved-schedule route lets interrupted writes be checked, never repeated.
      await update({ phase: "verify", message: `Checking the saved sections in "${job.name}"...` });
      const url = `https://www.myworkday.com/wustl/d/inst/15$369057/${job.scheduleIdentity}.htmld`;
      if (location.href !== url) { location.assign(url); return false; }
      root = await waitFor(savedResult, "Open Workday and sign in if needed, then Continue to verify the saved schedule.");
    }
    verifyTarget(root);
    verifySchedulePeriod(root);
    const expectedSections = [...new Set([...job.completed, job.writePending.course])].sort();
    const actualSections = [...new Set([...root.querySelectorAll('[data-automation-id="promptOption"],a')]
      .filter(visible).map(element => E.text(element.innerText).match(/^([A-Z]{2,10} \d{3,5}[A-Z]?-[A-Z0-9]{1,5}) - /)?.[1]).filter(Boolean))].sort();
    if (JSON.stringify(actualSections) !== JSON.stringify(expectedSections)) {
      throw new Error(`Workday's saved sections do not match the submitted set. Inspect "${job.name}" before trying again; nothing will be resubmitted.`);
    }
    for (const key of expectedSections) {
      const course = job.courses.find(item => `${item.code}-${item.section}` === key);
      if (!course) throw new Error("An unexpected section was found in the saved schedule.");
      const row = sectionElement(course, root)?.closest('tr,[role="row"]');
      const expected = [...new Set(course.meetings.map(meeting => `${meeting.days.padEnd(7, "-")}|${E.timeRange(meeting.time)?.join("|")}`))].sort();
      if (!row || JSON.stringify(E.meetingKeys(row.innerText)) !== JSON.stringify(expected)) throw new Error(`The saved meeting times for ${key} could not be verified.`);
    }
    const complete = expectedSections.length === job.courses.length;
    await update({ completed: expectedSections, index: expectedSections.length, writePending: null, status: complete ? "complete" : "running",
      phase: complete ? "complete" : "add", message: complete ? `Saved "${job.name}" in Workday. All ${expectedSections.length} selected sections were verified.`
        : `Verified ${expectedSections.length} of ${job.courses.length} saved sections.` });
    if (!complete && root !== document) {
      press("Done", root);
      await waitFor(() => !dialog(ADD), "Close the saved-schedule confirmation in Workday, then Continue.");
    }
    return true;
  }
  async function addCourse() {
    const course = job.courses[addOrder()[job.index]];
    await update({ message: `Adding ${course.code}-${course.section} to "${job.name}"...` });
    let form = dialog(ADD);
    if (!form) {
      if (!searchInput()) { await navigate(); await filters(); }
      form = await openAdd(course);
    }
    if (fieldInput("Saved Schedule", form)) {
      if (!sectionElement(course, form)) throw new Error("A different course is open in Workday. Return to Find Course Sections, then Continue.");
      await selectTarget(form);
      verifyTarget(form);
      press("Choose Times", form);
      form = await waitFor(() => {
        const root = dialog(ADD);
        return root && fieldText("Saved Schedule Name", root) && root.querySelector('input[type="checkbox"]:not(:disabled)') && root;
      }, "Workday did not load the section-selection form.");
    }
    verifyTimes(form, course);
    job = await send("BEFORE_WRITE", { id: job.id, kind: "add", course: `${course.code}-${course.section}` });
    press("OK", form);
    await waitFor(() => {
      const result = savedResult();
      if (result) return result;
      const error = dialog(ADD) && formError(dialog(ADD));
      if (error) throw new Error(error);
      return null;
    }, "Workday did not confirm the addition. Continue will check the saved result without submitting it twice.");
    await verifySaved();
  }

  async function run() {
    if (running) return;
    try {
      job = await send("POLL");
      if (!job || job.status !== "running") return;
      running = true;
      if (job.writePending) {
        if (job.writePending.kind !== "add") throw new Error("A previous schedule creation was not verified. Check Workday; it will not be submitted twice.");
        if (!await verifySaved()) return;
      }
      if (job.phase === "navigate") {
        await navigate();
        await filters();
        await update({ phase: "preflight", index: 0, message: "Checking every selected section before creating the saved schedule..." });
      }
      if (job.phase === "preflight") {
        for (let index = job.index; index < job.courses.length; index++) {
          const course = job.courses[index];
          await update({ message: `Checking ${course.code}-${course.section} in ${job.term}...` });
          const root = await openSection(course);
          const period = periodText(root);
          if (!job.term) await update({ term: E.semester(period) });
          await closeCourse();
          await update({ index: index + 1, checked: [...job.checked, { section: `${course.code}-${course.section}`, period }] });
        }
        await update({ phase: "create", index: 0, message: `Creating new saved schedule "${job.name}"...` });
      }
      if (job.phase === "create") await createSchedule();
      while (job.phase === "add" && job.status === "running") await addCourse();
    } catch (error) {
      if (job && E.ACTIVE.has(job.status)) {
        try { await update({ status: "paused", message: error.message }); } catch {}
      }
    } finally { running = false; }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[E.JOB_KEY]) return;
    const next = changes[E.JOB_KEY].newValue;
    if (job && next?.id === job.id && ["stopped", "paused"].includes(next.status)) job.status = next.status;
    if (!running && next?.status === "running") setTimeout(run, 300);
  });
  setTimeout(run, 1500);

})();
