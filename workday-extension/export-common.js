(function (root) {
  const JOB_KEY = "bearPlansWorkdayExport";
  const ACTIVE = new Set(["running", "paused", "writing"]);
  const TARGET_ACADEMIC_YEAR = "2025-2026";
  const text = value => String(value ?? "").replace(/\s+/g, " ").trim();

  function academicPeriod(value) {
    const input = text(value);
    const named = input.match(/^(Fall|Spring|Summer|Winter)\s+(20\d{2})$/i);
    if (named) return `${named[1][0].toUpperCase()}${named[1].slice(1).toLowerCase()} ${named[2]}`;
    const yearFirst = input.match(/^(20\d{2})(?:\s*-\s*20\d{2})?\s+(Fall|Spring|Summer|Winter)$/i);
    if (yearFirst) return `${yearFirst[2][0].toUpperCase()}${yearFirst[2].slice(1).toLowerCase()} ${yearFirst[1]}`;
    return "";
  }

  function semester(value) {
    const period = text(value).replace(/\s*\(.*$/, "");
    return academicPeriod(period.replace(/\s+(?:Half [AB]|Intersession)\s+/i, " "));
  }

  function academicYear(value) {
    const term = academicPeriod(value);
    if (!term) return "";
    const [season, yearText] = term.split(" ");
    const year = Number(yearText) - (season === "Fall" ? 0 : 1);
    return `${year}-${year + 1}`;
  }

  function validateSelection(value) {
    if (!value || typeof value !== "object") throw new Error("Choose a generated schedule first.");
    const name = text(value.name);
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(String(value.name))) {
      throw new Error("Enter a schedule name of 1 to 80 characters.");
    }
    const requestedTerm = academicPeriod(value.term);
    if (text(value.term) && !requestedTerm) throw new Error("The saved schedule has an invalid academic period.");
    if (!Array.isArray(value.courses) || !value.courses.length || value.courses.length > 30) {
      throw new Error("A schedule must contain 1 to 30 course sections.");
    }
    const courses = [];
    const seen = new Map();
    const terms = new Set(requestedTerm ? [requestedTerm] : []);
    for (const item of value.courses) {
      if (!item || typeof item !== "object") throw new Error("Invalid course section.");
      const code = text(item.code).toUpperCase();
      const section = text(item.section).toUpperCase();
      const itemTerm = academicPeriod(item.academicPeriod);
      if (text(item.academicPeriod) && !itemTerm) throw new Error(`Cannot read the academic period for ${code || "this course"}.`);
      if (requestedTerm && itemTerm && requestedTerm !== itemTerm) throw new Error(`${code} is not in ${requestedTerm}.`);
      if (itemTerm) terms.add(itemTerm);
      if (!/^[A-Z]{2,10} \d{3,5}[A-Z]?$/.test(code) || !/^[A-Z0-9]{1,5}$/.test(section)) {
        throw new Error(`Cannot match ${code || "this course"} to a Workday section.`);
      }
      if (seen.has(code)) {
        const previous = seen.get(code);
        if (previous.section !== section) throw new Error(`The chosen schedule has multiple sections of ${code}.`);
        if (previous.term && itemTerm && previous.term !== itemTerm) throw new Error(`${code} has meetings from different academic periods.`);
        continue;
      }
      seen.set(code, { section, term: itemTerm });
      if (!Array.isArray(item.meetings) || !item.meetings.length || item.meetings.length > 30) throw new Error(`Missing or invalid meeting times for ${code}. Regenerate this schedule.`);
      const meetings = item.meetings.map(meeting => {
        if (!meeting || typeof meeting !== "object") throw new Error(`Invalid meeting time for ${code}.`);
        const days = text(meeting.days).toUpperCase();
        const time = text(meeting.time);
        if (!/^[M-][T-][W-][R-][F-][S-][U-]?$/.test(days) || /^-+$/.test(days) || !timeRange(time) || time.length > 80) throw new Error(`Invalid meeting time for ${code}.`);
        return { days, time };
      });
      courses.push({ code, section, name: text(item.name || code).slice(0, 180), academicPeriod: itemTerm, meetings });
    }
    if (terms.size > 1) throw new Error("Every selected course must be from the same academic period.");
    const term = [...terms][0] || "";
    if (term && academicYear(term) !== TARGET_ACADEMIC_YEAR) {
      throw new Error(`Add to Workday currently supports the ${TARGET_ACADEMIC_YEAR} academic year.`);
    }
    return { name, term, courses };
  }

  function isWashUUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && /(^|\.)myworkday\.com$/.test(url.hostname)
        && /^\/wustl(?:\/|$)/.test(url.pathname);
    } catch { return false; }
  }

  function timeRange(value) {
    const match = text(value).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*[-\u2013\u2014]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!match) return null;
    if (![match[1], match[4]].every(hour => Number(hour) >= 1 && Number(hour) <= 12)
      || ![match[2] || 0, match[5] || 0].every(minute => Number(minute) <= 59)) return null;
    const minutes = (hour, minute, suffix) => (Number(hour) % 12 + (suffix.toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(minute || 0);
    const range = [minutes(match[1], match[2], match[3]), minutes(match[4], match[5], match[6])];
    return range[0] < range[1] ? range : null;
  }
  function meetingKeys(value) {
    const dayNames = [/\bMon(?:day)?\b/i, /\bTue(?:sday)?\b/i, /\bWed(?:nesday)?\b/i, /\bThu(?:rsday)?\b/i, /\bFri(?:day)?\b/i, /\bSat(?:urday)?\b/i, /\bSun(?:day)?\b/i];
    return [...new Set(String(value || "").split("\n").map(line => {
      const range = timeRange(line);
      if (!range) return null;
      const days = dayNames.map((pattern, index) => pattern.test(line) ? "MTWRFSU"[index] : "-").join("");
      return days === "-------" ? null : `${days}|${range.join("|")}`;
    }).filter(Boolean))].sort();
  }

  function publicJob(job) {
    if (!job) return null;
    return {
      id: job.id, name: job.name, term: job.term, status: job.status,
      message: job.message, completed: job.completed || [], total: job.courses.length,
      created: Boolean(job.created), updatedAt: job.updatedAt
    };
  }

  const api = { JOB_KEY, ACTIVE, TARGET_ACADEMIC_YEAR, text, academicPeriod, semester, academicYear, validateSelection, isWashUUrl, publicJob, timeRange, meetingKeys };
  root.BearPlansExport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
