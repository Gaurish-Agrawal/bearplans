(() => {
  if (window.__bearPlansWorkdayLoaded) return;
  window.__bearPlansWorkdayLoaded = true;

  const COURSE_CODE_RE = /\b([A-Z]{2,10})\s+(\d{3,5}[A-Z]?)\b/;
  const SECTION_ID_RE = /\b([A-Z]{2,10})\s+(\d{3,5}[A-Z]?)-([A-Z0-9]{1,5})\b/;
  const WORKDAY_HEADER_RE = /\b([A-Z]{2,10})\s+(\d{3,5}[A-Z]?)-([A-Z0-9]{1,5})\s*[-–—]\s*([^|\n]+)/;
  const TIME_VALUE_RE = /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\b/i;
  const TIME_RANGE_RE = /(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i;
  const REGISTRATION_SECTION_RE = /\b(Register|Cancel|Start Registration|Course Sections?|Available Sections?|Section Listing|Meeting Patterns?)\b/i;
  const REGISTRATION_ACTION_RE = /^(?:Register|Cancel|Review and Register|Back)$/i;
  const COURSE_MODAL_ACTION_RE = /^(?:Add to Saved Schedule|Troubleshoot)$/i;
  const UNAVAILABLE_STATUS_RE = /\b(?:Closed|Cancelled|Canceled)\b/i;
  const STORAGE_SECTIONS = "bearPlansWorkdaySections";
  const IS_TOP_FRAME = window.top === window;

  const state = {
    sections: [],
    collapsed: false,
    collecting: false
  };
  let quickActionTimer = null;

  function chromeGet(area, defaults) {
    return new Promise(resolve => {
      area.get(defaults, result => resolve(result || defaults));
    });
  }

  function chromeSet(area, value) {
    return new Promise(resolve => area.set(value, resolve));
  }

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function splitLines(text) {
    return (text || "")
      .split(/\n+/)
      .map(line => cleanText(line))
      .filter(Boolean);
  }

  function uniqueKey(section) {
    return [
      section.courseCode,
      section.courseName,
      section.section,
      section.academicPeriod,
      section.days,
      section.startTime,
      section.endTime
    ].map(cleanText).join("|").toLowerCase();
  }

  function courseKey(section) {
    return cleanText(section?.courseCode).toLowerCase();
  }

  function mergeSections(incoming) {
    const known = new Set(state.sections.map(uniqueKey));
    incoming.forEach(section => {
      const key = uniqueKey(section);
      if (!known.has(key)) {
        known.add(key);
        state.sections.push(section);
      }
    });
  }

  async function loadSectionsFromStorage() {
    const local = await chromeGet(chrome.storage.local, { [STORAGE_SECTIONS]: [] });
    state.sections = Array.isArray(local[STORAGE_SECTIONS]) ? local[STORAGE_SECTIONS] : [];
    return state.sections;
  }

  async function addSectionsToStorage(incoming) {
    const local = await chromeGet(chrome.storage.local, { [STORAGE_SECTIONS]: [] });
    const existing = Array.isArray(local[STORAGE_SECTIONS]) ? local[STORAGE_SECTIONS] : [];
    const merged = [...existing];
    const known = new Set(existing.map(uniqueKey));
    let addedCount = 0;

    incoming.forEach(section => {
      const key = uniqueKey(section);
      if (!known.has(key)) {
        known.add(key);
        merged.push(section);
        addedCount += 1;
      }
    });

    await chromeSet(chrome.storage.local, { [STORAGE_SECTIONS]: merged });
    state.sections = merged;
    return { addedCount, sections: merged };
  }

  function parseWorkdayHeader(lines, text) {
    const sources = [...lines, text];
    for (const source of sources) {
      const match = source.match(WORKDAY_HEADER_RE);
      if (!match) continue;

      return {
        courseCode: `${match[1]} ${match[2]}`,
        section: match[3],
        courseName: cleanText(match[4])
          .replace(/\s+\|\s+.*$/, "")
          .replace(/\b(Open|Closed|Waitlist|Waitlisted)\b.*$/i, "")
          .trim()
      };
    }
    return null;
  }

  function getCourseName(lines, courseCode) {
    const codeLine = lines.find(line => line.includes(courseCode)) || "";
    let name = codeLine
      .replace(new RegExp(`\\b${courseCode.replace(/\s+/g, "\\s+")}-[A-Z0-9]{1,5}\\s*[-–—]\\s*`, "i"), "")
      .replace(courseCode, "")
      .replace(/^[A-Z0-9]{1,5}\s*[-–—]\s*/, "")
      .replace(/^[-–—:\s]+/, "")
      .replace(/\bOpen\b|\bClosed\b|\bWaitlisted\b/gi, "")
      .trim();

    if (name.length < 3) {
      const codeIndex = lines.findIndex(line => line.includes(courseCode));
      const neighbor = lines[codeIndex + 1] || lines[codeIndex - 1] || "";
      if (!COURSE_CODE_RE.test(neighbor) && neighbor.length < 120) {
        name = neighbor;
      }
    }

    return name || courseCode;
  }

  function getSection(text, lines) {
    const patterns = [
      /\bsection(?!s\b)\s*[:#]?\s*([A-Z0-9]{1,5})\b/i,
      /\bclass section(?!s\b)\s*[:#]?\s*([A-Z0-9]{1,5})\b/i,
      /\bsec(?:\.|\b)\s*[:#]?\s*([A-Z0-9]{1,5})\b/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && !/^details$/i.test(match[1])) return match[1];
    }

    const compact = lines.find(line => /^([A-Z0-9]{1,5})$/.test(line));
    return compact || "01";
  }

  function extractLabeledValue(lines, labelPattern) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!labelPattern.test(line)) continue;

      const afterColon = line.split(":").slice(1).join(":").trim();
      if (afterColon && !labelPattern.test(afterColon)) return afterColon;

      const sameLine = line.replace(labelPattern, "").replace(/^[:\s–—-]+/, "").trim();
      if (sameLine && !labelPattern.test(sameLine)) return sameLine;

      if (lines[i + 1]) return lines[i + 1];
    }
    return "";
  }

  function extractSectionStatus(lines) {
    const labeledStatus = extractLabeledValue(lines, /^status\b/i);
    if (labeledStatus && /^(?:Open|Closed|Waitlist(?:ed)?|Cancelled|Canceled)$/i.test(labeledStatus)) {
      return cleanText(labeledStatus);
    }

    const leadingText = lines.slice(0, 16).join(" ");
    const status = leadingText.match(/\b(Open|Closed|Waitlist(?:ed)?|Cancelled|Canceled)\b/i);
    return status ? status[1] : "";
  }

  function extractAcademicPeriod(lines) {
    const value = extractLabeledValue(lines, /^academic period\b/i);
    const named = cleanText(value).match(/\b(Fall|Spring|Summer|Winter)(?:\s+(?:Half [AB]|Intersession))?\s+(20\d{2})\b/i);
    if (named) return `${named[1][0].toUpperCase()}${named[1].slice(1).toLowerCase()} ${named[2]}`;
    const yearFirst = cleanText(value).match(/\b(20\d{2})(?:\s*-\s*20\d{2})?\s+(Fall|Spring|Summer|Winter)\b/i);
    return yearFirst ? `${yearFirst[2][0].toUpperCase()}${yearFirst[2].slice(1).toLowerCase()} ${yearFirst[1]}` : "";
  }

  function extractDays(line, previousLine, nextLine) {
    const sources = [line, previousLine, nextLine].filter(Boolean);
    const dayNamePattern = /\b(Monday|Mon|Tuesday|Tues|Tue|Wednesday|Wed|Thursday|Thurs|Thu|Friday|Fri|Saturday|Sat|Sunday|Sun)\b(?:[,\s/]+(?:Monday|Mon|Tuesday|Tues|Tue|Wednesday|Wed|Thursday|Thurs|Thu|Friday|Fri|Saturday|Sat|Sunday|Sun)\b)*/i;
    const compactPattern = /\b(MWF|MW|WF|TR|TTH|TUTH|TH|TU|MTWRF|MTW|WRF|MR|MWR|TF|M|T|W|R|F|S|U)\b/i;

    for (const source of sources) {
      const named = source.match(dayNamePattern);
      if (named) return named[0];

      const compact = source.match(compactPattern);
      if (compact) return compact[0];
    }

    return "";
  }

  function extractTimeRange(text) {
    const explicitRange = (text || "").match(TIME_RANGE_RE);
    if (explicitRange) return [explicitRange[1], explicitRange[2]];

    const lines = splitLines(text);
    const labeledTime = label => {
      const labelIndex = lines.findIndex(line => label.test(line));
      if (labelIndex < 0) return null;

      const labelLine = lines[labelIndex];
      const labelMatch = labelLine.match(label);
      const sameLineMatch = labelMatch
        ? labelLine.slice(labelMatch.index + labelMatch[0].length).match(TIME_VALUE_RE)
        : null;
      return sameLineMatch || lines[labelIndex + 1]?.match(TIME_VALUE_RE) || null;
    };
    const startMatch = labeledTime(/\bstart\s*time\b/i);
    const endMatch = labeledTime(/\bend\s*time\b/i);

    return startMatch && endMatch ? [startMatch[1], endMatch[1]] : null;
  }

  function hasTimeRange(text) {
    return Boolean(extractTimeRange(text));
  }

  function isVisible(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function actionLabel(node) {
    return cleanText(
      node?.innerText ||
      node?.textContent ||
      node?.getAttribute?.("aria-label") ||
      node?.getAttribute?.("title") ||
      ""
    );
  }

  function registrationActionButtons(root = document) {
    return Array.from(root.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'))
      .filter(isVisible)
      .filter(button => REGISTRATION_ACTION_RE.test(actionLabel(button)));
  }

  function hasRegistrationActionPair(root = document) {
    const labels = new Set(registrationActionButtons(root).map(actionLabel));
    return labels.has("Register") && labels.has("Cancel");
  }

  function registrationActionContainer() {
    const buttons = registrationActionButtons();
    if (!buttons.length) return null;

    const anchor = buttons.find(button => /^(?:Register|Cancel)$/i.test(actionLabel(button))) || buttons[0];
    let current = anchor.parentElement;

    for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
      if (hasRegistrationActionPair(current)) return current;
      current = current.parentElement;
    }

    return null;
  }

  function isFindCourseSectionsPage() {
    const selectors = [
      "a",
      "button",
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      "h1",
      "h2",
      "h3",
      '[role="heading"]',
      "span",
      '[data-automation-id]'
    ];

    return Array.from(document.querySelectorAll(selectors.join(","))).some(node => {
      if (node.closest?.(".bearplans-panel")) return false;
      return isVisible(node) && /^Find Course Sections$/i.test(actionLabel(node));
    });
  }

  function courseSectionModalActionButtons(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'))
      .filter(isVisible)
      .filter(button => COURSE_MODAL_ACTION_RE.test(actionLabel(button)));
  }

  function courseSectionModalActionContainer(root) {
    const buttons = courseSectionModalActionButtons(root);
    if (!buttons.length) return null;

    let current = buttons[0].parentElement;
    for (let depth = 0; current && current !== root.parentElement && depth < 7; depth += 1) {
      if (buttons.every(button => current.contains(button))) return current;
      if (current === root) break;
      current = current.parentElement;
    }

    return buttons[0].parentElement;
  }

  function isCourseSectionModal(node) {
    if (!node || !isVisible(node)) return false;
    const text = textForParsing(node);
    return /\bView Course Section\b/i.test(text) &&
      WORKDAY_HEADER_RE.test(text) &&
      /\b(?:General Information|Additional Details|Meeting Patterns?)\b/i.test(text);
  }

  function findCourseSectionModalRoot() {
    if (!isFindCourseSectionsPage()) return null;

    const dialogSelectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[data-automation-id*="modal" i]',
      '[data-automation-id*="dialog" i]'
    ];
    const dialogs = Array.from(document.querySelectorAll(dialogSelectors.join(",")));
    const directDialog = dialogs.find(isCourseSectionModal);
    if (directDialog) return directDialog;

    const titleSelectors = [
      "h1",
      "h2",
      "h3",
      "h4",
      '[role="heading"]',
      '[data-automation-id*="title" i]',
      '[data-automation-id*="header" i]'
    ];
    const titleNodes = Array.from(document.querySelectorAll(titleSelectors.join(",")))
      .filter(node => isVisible(node) && /^View Course Section$/i.test(actionLabel(node)));

    for (const titleNode of titleNodes) {
      let current = titleNode.parentElement;
      let semanticMatch = null;
      for (let depth = 0; current && current !== document.body && depth < 14; depth += 1) {
        if (isCourseSectionModal(current)) {
          semanticMatch ||= current;
          if (courseSectionModalActionButtons(current).length) return current;
        }
        current = current.parentElement;
      }
      if (semanticMatch) return semanticMatch;
    }

    return null;
  }

  function meetingLocationFromLine(line) {
    const withoutLabel = cleanText(line.replace(/\bMeeting Patterns?\b/i, ""));
    const parts = withoutLabel.split(/\s*\|\s*/).map(cleanText).filter(Boolean);
    const location = parts.find(part =>
      !COURSE_CODE_RE.test(part) &&
      !extractDays(part, "", "") &&
      !hasTimeRange(part) &&
      (/\b(room|hall|building|campus|center|suite|lab|studio|field|gym|auditorium)\b/i.test(part) ||
        /^[A-Z][A-Z0-9 &.'-]{1,24},?\s*(?:Room\s*)?\d{1,5}[A-Z]?$/i.test(part) ||
        /^[A-Z][A-Z0-9 &.'-]{2,30}$/.test(part))
    );
    if (location) return location;

    return "";
  }

  function meetingTextCandidates(lines) {
    return lines.flatMap((line, index) => {
      const text = cleanText(line);
      if (!text || !hasTimeRange(text)) return [];

      return [{
        text,
        context: lines
          .slice(Math.max(0, index - 2), Math.min(lines.length, index + 3))
          .join(" | "),
        index
      }];
    });
  }

  function parseTextBlock(text) {
    const normalized = text.replace(/\r/g, "\n");
    const lines = splitLines(normalized);
    const codeMatch = normalized.match(COURSE_CODE_RE);
    if (!codeMatch) return [];

    const header = parseWorkdayHeader(lines, normalized);
    const courseCode = header?.courseCode || `${codeMatch[1]} ${codeMatch[2]}`;
    const courseName = header?.courseName || getCourseName(lines, courseCode);
    const section = header?.section || getSection(normalized, lines);
    const instructor = extractLabeledValue(lines, /\b(instructors?|faculty|professors?)\b/i);
    const labeledLocation = extractLabeledValue(lines, /\b(location|room|building)\b/i);
    const status = extractSectionStatus(lines);
    const academicPeriod = extractAcademicPeriod(lines);
    const sections = [];

    const seenMeetings = new Map();
    const addMeeting = (days, startTime, endTime, sourceText) => {
      if (!days || !startTime || !endTime) return;

      const building = meetingLocationFromLine(sourceText) || labeledLocation;
      const dedupeKey = [section, days, startTime, endTime].map(cleanText).join("|").toLowerCase();
      const existing = seenMeetings.get(dedupeKey);
      if (existing) {
        if (!existing.building && building) existing.building = building;
        return;
      }

      const parsedSection = {
        courseCode,
        courseName,
        section,
        days,
        startTime,
        endTime,
        building,
        instructor,
        status,
        academicPeriod
      };
      seenMeetings.set(dedupeKey, parsedSection);
      sections.push(parsedSection);
    };

    meetingTextCandidates(lines).forEach(({ text, context, index }) => {
      const days = extractDays(text, lines[index - 1], lines[index + 1]) ||
        extractDays(lines[index - 1], lines[index - 2], lines[index + 1]);
      if (!days) return;

      const explicitMatches = [...text.matchAll(new RegExp(TIME_RANGE_RE.source, "ig"))];
      if (explicitMatches.length) {
        explicitMatches.forEach(match => addMeeting(days, match[1], match[2], context));
        return;
      }
    });

    const labeledRange = extractTimeRange(normalized);
    const labeledDays = extractDays(normalized, "", "");
    if (labeledRange && labeledDays) {
      addMeeting(labeledDays, labeledRange[0], labeledRange[1], normalized);
    }

    return sections;
  }

  function uniqueSections(sections) {
    const seen = new Set();
    return sections.filter(section => {
      const key = uniqueKey(section);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseVisibleCourseText(text) {
    const normalized = (text || "").replace(/\r/g, "\n");
    if (!normalized.trim()) return [];

    const lines = normalized.split(/\n+/);
    const headerIndexes = [];
    const headerLinePattern = /\b[A-Z]{2,10}\s+\d{3,5}[A-Z]?-[A-Z0-9]{1,5}\s*[-–—]\s*/;

    lines.forEach((line, index) => {
      if (headerLinePattern.test(line)) headerIndexes.push(index);
    });

    if (headerIndexes.length === 0) {
      return uniqueSections(parseTextBlock(normalized));
    }

    const parsed = [];
    headerIndexes.forEach((startIndex, index) => {
      const endIndex = headerIndexes[index + 1] || Math.min(lines.length, startIndex + 90);
      const chunk = lines.slice(startIndex, endIndex).join("\n");
      parsed.push(...parseTextBlock(chunk));
    });

    if (parsed.length > 0) return uniqueSections(parsed);
    return uniqueSections(parseTextBlock(normalized));
  }

  function baseCourseFromText(text) {
    const lines = splitLines(text);
    const fullHeader = parseWorkdayHeader(lines, text);
    if (fullHeader) {
      return {
        courseCode: fullHeader.courseCode,
        courseName: fullHeader.courseName
      };
    }

    for (const line of lines) {
      const match = line.match(/\b([A-Z]{2,10})\s+(\d{3,5}[A-Z]?)\s*[-–—]\s*([^|\n]+)/);
      if (match && !/-[A-Z0-9]{1,5}\b/.test(`${match[1]} ${match[2]}`)) {
        return {
          courseCode: `${match[1]} ${match[2]}`,
          courseName: cleanText(match[3])
            .replace(/\b(Open|Closed|Waitlist|Waitlisted)\b.*$/i, "")
            .trim()
        };
      }
    }

    const codeMatch = text.match(COURSE_CODE_RE);
    if (!codeMatch) return null;

    return {
      courseCode: `${codeMatch[1]} ${codeMatch[2]}`,
      courseName: getCourseName(lines, `${codeMatch[1]} ${codeMatch[2]}`)
    };
  }

  function parseRegistrationSectionList(text) {
    const normalized = (text || "").replace(/\r/g, "\n");
    const hasSectionContext = REGISTRATION_SECTION_RE.test(normalized) || /\b(?:Course|Available) Sections?\b/i.test(normalized);
    if (!hasSectionContext || !COURSE_CODE_RE.test(normalized) || !hasTimeRange(normalized)) {
      return [];
    }

    const parsed = /\b[A-Z]{2,10}\s+\d{3,5}[A-Z]?-[A-Z0-9]{1,5}\b/.test(normalized)
      ? [...parseVisibleCourseText(normalized)]
      : [];
    const baseCourse = baseCourseFromText(normalized);
    if (!baseCourse) {
      return uniqueSections(parsed).filter(section => !UNAVAILABLE_STATUS_RE.test(section.status || ""));
    }

    const lines = normalized.split(/\n+/).map(line => cleanText(line));
    const sectionIndexes = [];

    lines.forEach((line, index) => {
      const sectionOnly = line.match(/^(?:section\s*)?(\d{1,4}[A-Z]?)(?:\s*[-–—]\s*(?:Open|Closed|Waitlist(?:ed)?))?$/i);
      if (!sectionOnly) return;

      const windowText = lines.slice(index, Math.min(lines.length, index + 24)).join("\n");
      if (hasTimeRange(windowText) && extractDays(windowText, "", "")) {
        sectionIndexes.push({ index, section: sectionOnly[1].toUpperCase() });
      }
    });

    sectionIndexes.forEach(({ index, section }, position) => {
      const nextIndex = sectionIndexes[position + 1]?.index || Math.min(lines.length, index + 40);
      const chunk = [
        `${baseCourse.courseCode}-${section} - ${baseCourse.courseName}`,
        ...lines.slice(index, nextIndex)
      ].join("\n");
      parsed.push(...parseTextBlock(chunk));
    });

    return uniqueSections(parsed).filter(section => !UNAVAILABLE_STATUS_RE.test(section.status || ""));
  }

  function sectionsMatchingCourse(sections, baseCourse) {
    if (!baseCourse?.courseCode) return [];
    const expectedCode = cleanText(baseCourse.courseCode).toLowerCase();
    return uniqueSections(sections).filter(section => courseKey(section) === expectedCode);
  }

  function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function sectionIdentityFromText(text) {
    const match = (text || "").match(SECTION_ID_RE);
    if (!match) return null;
    return {
      courseCode: `${match[1]} ${match[2]}`,
      section: match[3].toUpperCase()
    };
  }

  function sectionIdentityKey(courseCode, section) {
    return `${cleanText(courseCode).toLowerCase()}|${cleanText(section).toUpperCase()}`;
  }

  function sectionIdentityKeysFromText(text) {
    const matches = (text || "").matchAll(new RegExp(SECTION_ID_RE.source, "g"));
    return new Set(Array.from(matches, match => sectionIdentityKey(`${match[1]} ${match[2]}`, match[3])));
  }

  function courseResultRoot(titleNode, identity) {
    const expectedKey = sectionIdentityKey(identity.courseCode, identity.section);
    const preferred = titleNode.closest?.([
      '[role="row"]',
      "tr",
      "li",
      '[data-automation-id*="searchResult" i]',
      '[data-automation-id*="resultItem" i]'
    ].join(","));
    if (preferred) {
      const identities = sectionIdentityKeysFromText(textForParsing(preferred));
      if (identities.size === 1 && identities.has(expectedKey)) return preferred;
    }

    let current = titleNode.parentElement;
    let best = current || titleNode;
    for (let depth = 0; current && current !== document.body && depth < 10; depth += 1) {
      const identities = sectionIdentityKeysFromText(textForParsing(current));
      if (identities.size > 1) break;
      if (identities.has(expectedKey)) best = current;
      current = current.parentElement;
    }
    return best;
  }

  function courseResultNodeScore(node) {
    let score = 0;
    if (node.matches?.('a, [role="link"]')) score += 8;
    if (node.matches?.("button")) score += 4;
    if (!node.hasAttribute?.("aria-expanded")) score += 2;
    const label = actionLabel(node);
    if (SECTION_ID_RE.test(label.slice(0, 40))) score += 2;
    return score - Math.min(label.length, 1000) / 1000;
  }

  function matchingCourseResultEntries(baseCourse, modalRoot = null) {
    if (!baseCourse?.courseCode) return [];
    const expectedCode = cleanText(baseCourse.courseCode).toLowerCase();
    const selectors = [
      "a",
      "button",
      '[role="link"]',
      '[data-automation-id*="link" i]',
      '[data-automation-id*="title" i]'
    ];
    const bySection = new Map();

    document.querySelectorAll(selectors.join(",")).forEach(node => {
      if (!isVisible(node) || modalRoot?.contains(node) || node.closest?.(".bearplans-panel")) return;
      const label = actionLabel(node);
      if (label.length > 600) return;
      const identity = sectionIdentityFromText(label);
      if (!identity || cleanText(identity.courseCode).toLowerCase() !== expectedCode) return;

      const key = sectionIdentityKey(identity.courseCode, identity.section);
      const candidate = {
        key,
        courseCode: identity.courseCode,
        section: identity.section,
        titleNode: node,
        root: courseResultRoot(node, identity),
        score: courseResultNodeScore(node)
      };
      const existing = bySection.get(key);
      if (!existing || candidate.score > existing.score) bySection.set(key, candidate);
    });

    return [...bySection.values()];
  }

  function parseCourseResultEntry(entry, baseCourse) {
    if (!entry?.root) return [];
    const text = textForParsing(entry.root);
    return sectionsMatchingCourse(
      parseRegistrationSectionList(`Course Sections\n${text}`),
      baseCourse
    ).filter(section => cleanText(section.section).toUpperCase() === entry.section);
  }

  function resultExpansionControl(entry) {
    if (!entry?.root) return null;
    const controls = Array.from(entry.root.querySelectorAll('button, [role="button"]'))
      .filter(isVisible)
      .filter(control => control !== entry.titleNode && !control.contains(entry.titleNode))
      .filter(control => !control.classList?.contains("bearplans-workday-add"));
    const collapsed = controls.find(control => control.getAttribute("aria-expanded") === "false");
    if (collapsed) return collapsed;

    const labeled = controls.find(control => /\b(?:expand|show details|view details|view more)\b/i.test(actionLabel(control)));
    if (labeled) return labeled;

    const generic = controls.filter(control => {
      const label = actionLabel(control);
      return !SECTION_ID_RE.test(label) && (label.length === 0 || Boolean(control.querySelector?.("svg")));
    });
    return generic.length === 1 ? generic[0] : null;
  }

  function resultEntryHasNoUsableMeeting(entry) {
    const text = textForParsing(entry?.root);
    return UNAVAILABLE_STATUS_RE.test(text) ||
      /\b(?:TBA|To Be Announced|Arranged|No Meeting Patterns?)\b/i.test(text);
  }

  function registrationRowTexts(root) {
    const selectors = [
      '[role="row"]',
      'tr',
      '[data-automation-id*="section" i]',
      '[data-automation-id*="course" i]'
    ];
    const rows = new Set();

    root.querySelectorAll(selectors.join(",")).forEach(node => {
      if (!isVisible(node)) return;
      const text = cleanText(node.innerText || node.textContent || "");
      if (text.length < 12 || text.length > 5000 || !hasTimeRange(text)) return;
      if (!extractDays(text, "", "")) return;
      rows.add(text);
    });

    return [...rows].slice(0, 250);
  }

  function textForParsing(node) {
    const text = node?.innerText || node?.textContent || "";
    if (!text) return "";

    return text.length > 160000 ? text.slice(0, 160000) : text;
  }

  function registrationContentRoot() {
    const actionContainer = registrationActionContainer();
    if (!actionContainer) return null;

    let current = actionContainer;
    for (let depth = 0; current && current !== document.body && depth < 14; depth += 1) {
      const text = textForParsing(current);
      const hasSectionList = /\b(?:Course|Available) Sections?\b/i.test(text);
      if (hasSectionList && baseCourseFromText(text) && hasTimeRange(text)) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function isRegistrationSectionPage() {
    return Boolean(registrationContentRoot());
  }

  function currentCourseContext() {
    const modalRoot = findCourseSectionModalRoot();
    if (modalRoot) {
      const modalText = textForParsing(modalRoot);
      const header = parseWorkdayHeader(splitLines(modalText), modalText);
      return {
        kind: "find-course-section",
        scope: modalRoot,
        actionContainer: courseSectionModalActionContainer(modalRoot),
        baseCourse: header ? { courseCode: header.courseCode, courseName: header.courseName } : null,
        selectedSection: header?.section?.toUpperCase() || ""
      };
    }

    const registrationRoot = registrationContentRoot();
    if (registrationRoot) {
      return {
        kind: "start-registration",
        scope: registrationRoot,
        actionContainer: registrationActionContainer()
      };
    }

    return null;
  }

  function modalSections(root, baseCourse) {
    if (!root || !baseCourse) return [];
    return sectionsMatchingCourse(
      parseRegistrationSectionList(textForParsing(root)),
      baseCourse
    );
  }

  function modalCloseButton(root) {
    if (!root) return null;
    const controls = Array.from(root.querySelectorAll([
      "button",
      '[role="button"]',
      '[data-automation-id*="close" i]',
      '[aria-label*="close" i]',
      '[title*="close" i]'
    ].join(","))).filter(isVisible);
    return controls.find(control => /^Close(?: dialog| window)?$/i.test(actionLabel(control))) ||
      controls.find(control =>
        /close/i.test(control.getAttribute?.("data-automation-id") || "") ||
        /close/i.test(control.getAttribute?.("aria-label") || "") ||
        /close/i.test(control.getAttribute?.("title") || "")
      ) || null;
  }

  async function waitForValue(readValue, attempts = 40, interval = 125) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const value = readValue();
      if (value) return value;
      await wait(interval);
    }
    return null;
  }

  async function closeCourseSectionModal(root) {
    const closeButton = modalCloseButton(root);
    if (!closeButton) return false;
    closeButton.click();
    return Boolean(await waitForValue(() => findCourseSectionModalRoot() ? null : true, 32, 125));
  }

  async function openCourseResultModal(baseCourse, section) {
    const entry = matchingCourseResultEntries(baseCourse, findCourseSectionModalRoot())
      .find(candidate => candidate.section === section);
    if (!entry?.titleNode) return null;

    entry.titleNode.click();
    return waitForValue(() => {
      const root = findCourseSectionModalRoot();
      if (!root) return null;
      const identity = sectionIdentityFromText(textForParsing(root));
      return identity &&
        cleanText(identity.courseCode).toLowerCase() === cleanText(baseCourse.courseCode).toLowerCase() &&
        identity.section === section
        ? root
        : null;
    }, 48, 125);
  }

  function addResolvedSection(resolved, section) {
    if (section) resolved.add(cleanText(section).toUpperCase());
  }

  async function collectAllFindCourseSections(context, onProgress = () => {}) {
    const baseCourse = context.baseCourse;
    const originalSection = context.selectedSection;
    if (!baseCourse?.courseCode || !originalSection) {
      return { sections: [], complete: false, error: "Could not identify the selected course." };
    }

    const initialEntries = matchingCourseResultEntries(baseCourse, context.scope);
    if (initialEntries.length === 0) {
      return {
        sections: [],
        complete: false,
        error: "Could not find this course's section rows in the search results."
      };
    }

    const expectedSections = new Set(initialEntries.map(entry => entry.section));
    const resolvedSections = new Set();
    let collected = modalSections(context.scope, baseCourse);
    const selectedModalText = textForParsing(context.scope);
    const selectedAcademicPeriod = extractAcademicPeriod(splitLines(selectedModalText));
    if (collected.length > 0 || UNAVAILABLE_STATUS_RE.test(selectedModalText) || !hasTimeRange(selectedModalText)) {
      addResolvedSection(resolvedSections, originalSection);
    }

    const attemptedExpansions = new Set();
    for (let pass = 0; pass < 8 && resolvedSections.size < expectedSections.size; pass += 1) {
      const entries = matchingCourseResultEntries(baseCourse, findCourseSectionModalRoot());
      let expandedCount = 0;

      entries.forEach(entry => {
        if (resolvedSections.has(entry.section)) return;
        const parsed = parseCourseResultEntry(entry, baseCourse);
        if (parsed.length > 0) {
          collected = uniqueSections([...collected, ...parsed]);
          addResolvedSection(resolvedSections, entry.section);
          return;
        }
        if (resultEntryHasNoUsableMeeting(entry)) {
          addResolvedSection(resolvedSections, entry.section);
          return;
        }
        if (attemptedExpansions.has(entry.key)) return;

        const control = resultExpansionControl(entry);
        if (!control) return;
        attemptedExpansions.add(entry.key);
        control.click();
        expandedCount += 1;
      });

      onProgress(`Reading ${resolvedSections.size} of ${expectedSections.size} sections...`);
      if (resolvedSections.size >= expectedSections.size) break;
      await wait(expandedCount > 0 ? 500 : 300);
    }

    let unresolved = [...expectedSections].filter(section => !resolvedSections.has(section));
    let usedModalFallback = false;
    if (unresolved.length > 0) {
      usedModalFallback = true;
      onProgress(`Opening ${unresolved.length} remaining section${unresolved.length === 1 ? "" : "s"}...`);

      let activeModal = findCourseSectionModalRoot();
      if (activeModal && !await closeCourseSectionModal(activeModal)) {
        return {
          sections: [],
          complete: false,
          error: "Could not close Workday's section window to inspect the remaining sections."
        };
      }

      for (let index = 0; index < unresolved.length; index += 1) {
        const section = unresolved[index];
        onProgress(`Reading section ${index + 1} of ${unresolved.length}...`);
        const openedModal = await openCourseResultModal(baseCourse, section);
        if (!openedModal) continue;

        const parsed = modalSections(openedModal, baseCourse)
          .filter(item => cleanText(item.section).toUpperCase() === section);
        const modalText = textForParsing(openedModal);
        if (parsed.length > 0) {
          collected = uniqueSections([...collected, ...parsed]);
          addResolvedSection(resolvedSections, section);
        } else if (UNAVAILABLE_STATUS_RE.test(modalText) || !hasTimeRange(modalText)) {
          addResolvedSection(resolvedSections, section);
        }

        if (!await closeCourseSectionModal(openedModal)) break;
      }

      unresolved = [...expectedSections].filter(section => !resolvedSections.has(section));
      await openCourseResultModal(baseCourse, originalSection);
    }

    const sections = sectionsMatchingCourse(collected, baseCourse).map(section => ({
      ...section,
      academicPeriod: section.academicPeriod || selectedAcademicPeriod
    }));
    return {
      sections,
      complete: unresolved.length === 0,
      discoveredCount: expectedSections.size,
      skippedCount: expectedSections.size - new Set(collected.map(section => cleanText(section.section).toUpperCase())).size,
      usedModalFallback,
      error: unresolved.length > 0
        ? `Could not inspect section${unresolved.length === 1 ? "" : "s"} ${unresolved.join(", ")}.`
        : ""
    };
  }

  function collectSectionsFromDocument(scope = registrationContentRoot()) {
    if (!scope) {
      return [];
    }

    const bodyText = textForParsing(scope);

    const baseCourse = baseCourseFromText(bodyText);
    const candidates = [bodyText];
    if (baseCourse) {
      registrationRowTexts(scope).forEach(row => {
        candidates.push([
          `${baseCourse.courseCode} - ${baseCourse.courseName}`,
          "Course Sections",
          row
        ].join("\n"));
      });
    }

    return sectionsMatchingCourse(candidates.flatMap(parseRegistrationSectionList), baseCourse);
  }

  async function collectOpenCourseSections(onProgress = () => {}) {
    const context = currentCourseContext();
    const scope = context?.scope || null;
    if (context?.kind === "find-course-section") {
      const result = await collectAllFindCourseSections(context, onProgress);
      return {
        ...result,
        source: context.kind,
        isRegistrationSectionPage: false
      };
    }

    const sections = collectSectionsFromDocument(scope);

    return {
      sections,
      source: context?.kind || null,
      complete: Boolean(context),
      discoveredCount: new Set(sections.map(section => section.section)).size,
      skippedCount: 0,
      error: "",
      isRegistrationSectionPage: context?.kind === "start-registration"
    };
  }

  async function addOpenCourseSection() {
    if (state.collecting) {
      setStatus("BearPlans is already reading a course.");
      return;
    }

    const addButton = document.querySelector(".bearplans-add");
    if (addButton) addButton.disabled = true;
    state.collecting = true;

    try {
      const collected = await collectOpenCourseSections(message => setStatus(message));
      if (!collected.source && collected.sections.length === 0) {
        setStatus("Open a result in Find Course Sections, then add it from the View Course Section window.");
        return;
      }
      if (!collected.complete) {
        setStatus(collected.error || "Could not verify every section for this course. Nothing was added.");
        return;
      }

      const found = collected.sections;
      if (found.length === 0) {
        setStatus("This course has no open sections with usable meeting days and times.");
        return;
      }

      const { addedCount } = await addSectionsToStorage(found);
      const addedCourse = found[0]?.courseCode || "this course";
      const addedSections = new Set(found.map(section => section.section).filter(Boolean)).size;
      render();
      setStatus(addedCount > 0
        ? `Added all ${addedSections} usable section${addedSections === 1 ? "" : "s"} for ${addedCourse}.`
        : `All usable sections for ${addedCourse} were already added.`);
    } catch (error) {
      setStatus(`Could not read this course: ${error.message}`);
    } finally {
      state.collecting = false;
      if (addButton) addButton.disabled = false;
    }
  }

  function sectionsForApi() {
    const grouped = new Map();

    state.sections.forEach(section => {
      const courseCode = cleanText(section.courseCode);
      const courseName = cleanText(section.courseName) || courseCode;
      const key = courseCode.toLowerCase();

      if (!grouped.has(key)) {
        grouped.set(key, {
          courseCode,
          courseName,
          sections: []
        });
      }

      grouped.get(key).sections.push({
        section: section.section,
        academicPeriod: section.academicPeriod,
        days: section.days,
        startTime: section.startTime,
        endTime: section.endTime,
        building: section.building,
        instructor: section.instructor
      });
    });

    return [...grouped.values()];
  }

  function generateViaBackground(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "BEARPLANS_GENERATE",
        payload
      }, response => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response) {
          reject(new Error("No response from BearPlans extension background worker."));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error || `BearPlans returned ${response.status || "an error"}`));
          return;
        }

        resolve(response.data);
      });
    });
  }

  async function generateSchedule() {
    await loadSectionsFromStorage();
    render();

    if (state.sections.length === 0) {
      setStatus("Add at least one open Workday course section first.");
      return;
    }

    const button = document.querySelector(".bearplans-generate");
    if (button) button.disabled = true;
    setStatus("Generating schedules in BearPlans...");

    try {
      const data = await generateViaBackground({
        courses: sectionsForApi(),
        maxnumber: 50,
        noClassBefore: "00:00",
        noClassAfter: "23:59",
        timeStart: [],
        timeEnd: []
      });

      setStatus(data.status === "ok"
        ? `Generated ${data.scheduleCount} schedule${data.scheduleCount === 1 ? "" : "s"} and opened BearPlans.`
        : "No schedules found. Opened BearPlans suggestions.");
    } catch (error) {
      setStatus(`Could not generate: ${error.message}`);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function setStatus(message) {
    const status = document.querySelector(".bearplans-status");
    if (status) status.textContent = message;
  }

  async function saveSections() {
    await chromeSet(chrome.storage.local, { [STORAGE_SECTIONS]: state.sections });
  }

  function removeCourse(key) {
    state.sections = state.sections.filter(section => courseKey(section) !== key);
    saveSections();
    render();
  }

  function groupSectionsByCourse(sections = state.sections) {
    const grouped = new Map();

    sections.forEach(section => {
      const key = courseKey(section);
      if (!key) return;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          courseCode: cleanText(section.courseCode),
          courseName: cleanText(section.courseName) || cleanText(section.courseCode),
          sections: []
        });
      }
      grouped.get(key).sections.push(section);
    });

    return [...grouped.values()];
  }

  function clearSections() {
    state.sections = [];
    saveSections();
    render();
    setStatus("Cleared imported sections.");
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.className = "bearplans-panel";
    panel.innerHTML = `
      <div class="bearplans-header">
        <div class="bearplans-title">BearPlans</div>
        <button class="bearplans-toggle" type="button">Hide</button>
      </div>
      <div class="bearplans-body">
        <div class="bearplans-status">Open one result in Find Course Sections to add all sections for that course.</div>
        <div class="bearplans-actions">
          <button class="bearplans-add" type="button">Add all course sections</button>
          <button class="bearplans-generate" type="button">Generate schedules</button>
          <button class="bearplans-clear" type="button">Clear</button>
        </div>
        <div class="bearplans-list"></div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(".bearplans-toggle").addEventListener("click", () => {
      state.collapsed = !state.collapsed;
      panel.classList.toggle("bp-collapsed", state.collapsed);
      panel.querySelector(".bearplans-toggle").textContent = state.collapsed ? "Show" : "Hide";
    });
    panel.querySelector(".bearplans-add").addEventListener("click", addOpenCourseSection);
    panel.querySelector(".bearplans-generate").addEventListener("click", generateSchedule);
    panel.querySelector(".bearplans-clear").addEventListener("click", clearSections);

  }

  async function addCurrentWorkdaySections(button) {
    if (state.collecting) {
      button.textContent = "Already reading course...";
      return;
    }

    state.collecting = true;
    button.disabled = true;
    button.textContent = "Finding sections...";

    let finalText = "Add course to BearPlans";
    try {
      const collected = await collectOpenCourseSections(message => {
        const match = message.match(/(\d+) of (\d+)/);
        button.textContent = match ? `Reading ${match[1]}/${match[2]}...` : "Reading sections...";
        if (IS_TOP_FRAME) setStatus(message);
      });
      if (!collected.source) {
        finalText = "Open a course result first";
        return;
      }
      if (!collected.complete) {
        finalText = "Could not read every section";
        if (IS_TOP_FRAME) setStatus(collected.error || "Nothing was added because not every section could be verified.");
        return;
      }

      const sections = collected.sections;
      if (sections.length === 0) {
        finalText = "No usable sections found";
        if (IS_TOP_FRAME) setStatus("This course has no open sections with usable meeting times.");
        return;
      }

      button.textContent = "Adding...";
      const { addedCount } = await addSectionsToStorage(sections);
      const sectionCount = new Set(sections.map(section => section.section).filter(Boolean)).size;
      if (IS_TOP_FRAME) render();

      finalText = addedCount > 0
        ? `Added all ${sectionCount} section${sectionCount === 1 ? "" : "s"}`
        : "All sections already added";

      if (IS_TOP_FRAME) {
        const courseCode = sections[0]?.courseCode || "course";
        setStatus(addedCount > 0
          ? `Added all ${sectionCount} usable section${sectionCount === 1 ? "" : "s"} for ${courseCode}.`
          : `All usable sections for ${courseCode} were already added.`);
      }
    } catch (error) {
      finalText = "Could not read course";
      if (IS_TOP_FRAME) setStatus(`Could not read this course: ${error.message}`);
    } finally {
      state.collecting = false;
      const feedbackButton = document.querySelector(".bearplans-workday-add") || button;
      feedbackButton.textContent = finalText;
      feedbackButton.disabled = false;

      window.setTimeout(() => {
        feedbackButton.textContent = "Add course to BearPlans";
      }, 2200);
    }
  }

  function makeQuickAddButton() {
    const button = document.createElement("button");
    button.className = "bearplans-workday-add";
    button.type = "button";
    button.textContent = "Add course to BearPlans";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      addCurrentWorkdaySections(button);
    });
    return button;
  }

  function ensureWorkdayQuickAction() {
    const context = currentCourseContext();
    const actionContainer = context?.actionContainer || null;
    const inlineButtons = Array.from(document.querySelectorAll(".bearplans-workday-add"));

    if (!actionContainer) {
      inlineButtons.forEach(button => button.remove());
      return;
    }

    const correctlyPlaced = inlineButtons.find(button => actionContainer.contains(button));
    inlineButtons.forEach(button => {
      if (button !== correctlyPlaced) button.remove();
    });
    if (correctlyPlaced) return;

    actionContainer.appendChild(makeQuickAddButton());
  }

  function scheduleQuickActionCheck() {
    if (quickActionTimer) return;
    quickActionTimer = window.setTimeout(() => {
      quickActionTimer = null;
      ensureWorkdayQuickAction();
    }, 700);
  }

  function startQuickActionObserver() {
    if (!document.body) {
      window.setTimeout(startQuickActionObserver, 500);
      return;
    }

    ensureWorkdayQuickAction();

    const observer = new MutationObserver(scheduleQuickActionCheck);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function render() {
    const list = document.querySelector(".bearplans-list");
    if (!list) return;

    list.innerHTML = "";
    if (state.sections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "bearplans-empty";
      empty.textContent = "No sections imported yet.";
      list.appendChild(empty);
      return;
    }

    groupSectionsByCourse().forEach(group => {
      const item = document.createElement("div");
      item.className = "bearplans-section";

      const title = document.createElement("strong");
      const sectionNumbers = [...new Set(group.sections.map(section => cleanText(section.section)).filter(Boolean))];
      title.textContent = `${group.courseCode} · ${sectionNumbers.length} section${sectionNumbers.length === 1 ? "" : "s"}`;

      const name = document.createElement("span");
      name.textContent = group.courseName;

      const time = document.createElement("span");
      time.textContent = sectionNumbers.length > 0 ? sectionNumbers.join(", ") : "Available sections";

      const remove = document.createElement("button");
      remove.className = "bearplans-remove";
      remove.type = "button";
      remove.textContent = "Remove course";
      remove.addEventListener("click", () => removeCourse(group.key));

      item.appendChild(title);
      item.appendChild(name);
      item.appendChild(time);
      item.appendChild(remove);
      list.appendChild(item);
    });
  }

  async function init() {
    const local = await chromeGet(chrome.storage.local, { [STORAGE_SECTIONS]: [] });
    state.sections = Array.isArray(local[STORAGE_SECTIONS]) ? local[STORAGE_SECTIONS] : [];
    buildPanel();
    render();
    chrome.storage.onChanged?.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_SECTIONS]) return;
      const next = changes[STORAGE_SECTIONS].newValue;
      state.sections = Array.isArray(next) ? next : [];
      render();
    });
    startQuickActionObserver();
  }

  if (globalThis.__BEARPLANS_EXTENSION_TEST_HOOK__) {
    globalThis.__BEARPLANS_EXTENSION_TEST_HOOK__ = {
      extractTimeRange,
      extractAcademicPeriod,
      parseRegistrationSectionList,
      parseVisibleCourseText,
      baseCourseFromText,
      findCourseSectionModalRoot,
      isRegistrationSectionPage,
      isFindCourseSectionsPage,
      registrationContentRoot,
      sectionsMatchingCourse,
      uniqueSections,
      sectionsForApi,
      groupSectionsByCourse,
      state
    };
    return;
  }

  if (IS_TOP_FRAME) {
    init();
  } else {
    startQuickActionObserver();
  }
})();
