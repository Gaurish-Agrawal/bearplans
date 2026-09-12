# Workday saved-schedule export verification

Verified locally on September 3, 2026 with the signed-in WashU Workday session.

## Live results

- Created `BearPlans QA 2026-09-03` and `BearPlans Verified Fall 2026` as new saved schedules.
- Both contain exactly ACCT 2610-01 (Mon/Wed, 8:30-9:50 AM, Fall 2026) and ACCT 4013-01 (Tue/Thu, 2:30-3:50 PM, Fall Half A 2026).
- Checked the completed Workday tables, saved-schedule identifiers, academic periods, and meeting times, not just a success message.
- Verified recovery after reloading the extension and Workday: the first saved section was read back rather than added twice.
- An older generated Ethics I meeting time was rejected before schedule creation.
- No registration, drop, or existing saved-schedule edit action was submitted. The two new test schedules remain in Workday for inspection.
- Testing used separate Chrome windows; the user's original unfinished Workday form was not refreshed or submitted.

## Automated checks

- Original importer parser, background, popup, and headless Chrome integration checks.
- Seven backend integration tests for schedule generation and Workday payloads.
- Export validation and background tests covering source origin, top-frame and assigned-tab restrictions, concurrent starts, unsupported actions, duplicate writes, immutable target identity, login redirects, interrupted writes, and completion checks.
- Nine browser fixture cases covering successful saves, stale accessibility state, loading inputs, half-term periods, wrong saved-schedule identity, wrong semester, changed times, unverified creation, and extra selected sections.
- Desktop and mobile dialog screenshots and bounds checks. Source dialog requests contain the selected sections and their meeting times.
- Version 1.3.1 browser fixtures verify that only the 2025-2026 academic-year checkbox is clicked; academic-period, level, and other-year filters remain unchanged. They also verify that the website asks only for a schedule name and transfers the imported period automatically.

Run the commands in `README.md`. Browser fixtures are isolated from the normal Chrome profile. The export browser test needs Playwright and the local server on port 5001.

## Before public release

The September 3 homepage onboarding update also passed five backend checks and a background Playwright suite covering homepage navigation, the preview ZIP, the real site bridge with a mocked read-only extension runtime, missing/incorrect connections, HTTP and non-JSON server failures, desktop/mobile layouts, and no-JavaScript instructions. Screenshots are in `artifacts/extension-setup`. The exporter DOM fixture suite was rerun successfully. No live Workday writes were made for this UI update.

Run `python -m unittest discover -s tests -v` and, with Playwright installed, `node tests/extension-setup.browser.cjs`. Run `./package-site.sh` first to build the preview download. The browser test expects the local server on port 5001, or `BEARPLANS_TEST_URL` pointing to a preview-mode test server.

Deploy the updated Flask site and extension together, then verify the public server connection and one live save from the public timetable. Local verification does not certify the public deployment, every course's eligibility, or future Workday UI changes. Workday waitlists and registration alerts still apply; a saved schedule is not registration.
