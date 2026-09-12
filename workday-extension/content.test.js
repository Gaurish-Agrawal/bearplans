const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  __BEARPLANS_EXTENSION_TEST_HOOK__: true
};
sandbox.window = sandbox;
sandbox.window.top = sandbox.window;
sandbox.window.getComputedStyle = () => ({ display: "block", visibility: "visible" });
sandbox.document = {};

vm.runInNewContext(source, sandbox, { filename: "content.js" });
const parser = sandbox.__BEARPLANS_EXTENSION_TEST_HOOK__;

assert.equal(typeof parser.parseRegistrationSectionList, "function");

const compactSectionList = `
CHEM 2501 - Organic Chemistry I
Course Sections
01
Open
Meeting Patterns
Monday/Wednesday
1:00 PM - 2:20 PM
02
Open
Meeting Patterns
Tuesday/Thursday
10:00 AM - 11:20 AM
Register
Cancel`;

const compactSections = parser.parseRegistrationSectionList(compactSectionList);
assert.equal(compactSections.length, 2);
assert.equal(
  JSON.stringify(compactSections.map(section => [section.courseCode, section.section, section.days, section.startTime, section.endTime])),
  JSON.stringify([
    ["CHEM 2501", "01", "Monday/Wednesday", "1:00 PM", "2:20 PM"],
    ["CHEM 2501", "02", "Tuesday/Thursday", "10:00 AM", "11:20 AM"]
  ])
);

const explicitHeaders = `
CSE 1310-01 - Introduction to Computer Science
Course Sections
Mon/Wed | 11:30 AM - 12:50 PM
CSE 1310-02 - Introduction to Computer Science
Tue/Thu | 1:00 PM - 2:20 PM
CSE 1310-03 - Introduction to Computer Science
Closed
Fri | 9:00 AM - 10:00 AM
Register
Cancel`;

const headerSections = parser.parseRegistrationSectionList(explicitHeaders);
assert.equal(headerSections.length, 2);
assert.equal(
  JSON.stringify(headerSections.map(section => [section.section, section.days, section.startTime, section.endTime])),
  JSON.stringify([
    ["01", "Mon/Wed", "11:30 AM", "12:50 PM"],
    ["02", "Tue/Thu", "1:00 PM", "2:20 PM"]
  ])
);

const findCourseModal = `
View Course Section
CSE 1310-02 - Introduction to Computer Science
General Information
Instructor
Alex Morgan
Status
Open
Academic Period
Fall 2025
Additional Details
Meeting Patterns
LOPATA, Room 101 | Tue/Thu | 1:00 PM - 2:20 PM
SIMON, Room 00105 | Fri | 9:00 AM - 9:50 AM
Add to Saved Schedule
Troubleshoot`;

const modalSections = parser.parseRegistrationSectionList(findCourseModal);
assert.equal(modalSections.length, 2);
assert.ok(modalSections.every(section => section.academicPeriod === "Fall 2025"));
assert.equal(parser.extractAcademicPeriod(["Academic Period", "Fall Half A 2025"]), "Fall 2025");
assert.equal(
  JSON.stringify(modalSections.map(section => [section.section, section.days, section.startTime, section.endTime])),
  JSON.stringify([
    ["02", "Tue/Thu", "1:00 PM", "2:20 PM"],
    ["02", "Fri", "9:00 AM", "9:50 AM"]
  ])
);

const labeledTimes = `
BME 4191 - AI-Augmented Neuromedical Data Science
Available Sections
Section 01
Days
Tuesday/Thursday
Start Time
2:30 PM
End Time
3:50 PM
Register
Cancel`;

const labeledSections = parser.parseRegistrationSectionList(labeledTimes);
assert.equal(labeledSections.length, 1);
assert.equal(
  JSON.stringify([
    labeledSections[0].courseCode,
    labeledSections[0].section,
    labeledSections[0].days,
    labeledSections[0].startTime,
    labeledSections[0].endTime
  ]),
  JSON.stringify(["BME 4191", "01", "Tuesday/Thursday", "2:30 PM", "3:50 PM"])
);

let testActions = [];
const actionParent = {
  parentElement: null,
  querySelectorAll: () => testActions
};
const actionButton = label => ({
  innerText: label,
  textContent: label,
  parentElement: actionParent,
  getBoundingClientRect: () => ({ width: 40, height: 20 }),
  getAttribute: () => ""
});

sandbox.document.body = {
  innerText: `
CHEM 2501 - Organic Chemistry I
Course Sections
Section 01
Monday/Wednesday | 1:00 PM - 2:20 PM
Register
Cancel`
};
actionParent.innerText = sandbox.document.body.innerText;
testActions = [actionButton("Register"), actionButton("Cancel")];
sandbox.document.querySelectorAll = () => testActions;
assert.equal(parser.isRegistrationSectionPage(), true);

sandbox.document.body.innerText = `
Academics
Planning and Registration
CHEM 2501 - Organic Chemistry I
Monday/Wednesday | 1:00 PM - 2:20 PM`;
sandbox.document.querySelectorAll = () => [];
assert.equal(parser.isRegistrationSectionPage(), false);

parser.state.sections = [...compactSections, ...headerSections];
const grouped = parser.sectionsForApi();
assert.equal(grouped.length, 2);
assert.equal(grouped[0].sections.length, 2);
assert.equal(grouped[1].sections.length, 2);

parser.state.sections = modalSections;
const periodPayload = parser.sectionsForApi();
assert.ok(periodPayload[0].sections.every(section => section.academicPeriod === "Fall 2025"));

const filtered = parser.sectionsMatchingCourse(
  [...compactSections, ...headerSections],
  { courseCode: "CHEM 2501", courseName: "Organic Chemistry I" }
);
assert.equal(filtered.length, 2);
assert.ok(filtered.every(section => section.courseCode === "CHEM 2501"));

const courseGroups = parser.groupSectionsByCourse([...compactSections, ...headerSections]);
assert.equal(courseGroups.length, 2);
assert.equal(courseGroups[0].courseCode, "CHEM 2501");
assert.equal(new Set(courseGroups[0].sections.map(section => section.section)).size, 2);

console.log("Workday registration parser tests passed.");
