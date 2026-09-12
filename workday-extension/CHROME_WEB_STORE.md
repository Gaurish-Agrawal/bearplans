# Chrome Web Store listing

## Name

BearPlans Workday Importer

## Short description

Build BearPlans schedules from WashU Workday courses and save a chosen schedule back to Workday.

## Detailed description

Build BearPlans schedules without downloading or importing JSON files.

Use WashU Workday's **Find Course Sections** page and open any result for a course. Click **Add course to BearPlans** directly in the **View Course Section** window beside Workday's existing course actions. With that one click, the extension finds every matching section for the selected course, reads all meeting patterns, and groups the sections as schedule alternatives. Repeat once per course, then generate conflict-free schedule combinations in BearPlans.

The extension expands only results matching the selected course code and automatically opens matching detail windows only when needed. It does not inspect unrelated results, register for courses, drop courses, or read Workday credentials and MFA codes.

Choose **Add to Workday** above a generated schedule, give it a new name, and confirm. BearPlans carries the academic period from the imported course data automatically. The extension checks the exact sections, period, and current meeting times, creates a new Workday saved schedule, and verifies each saved section. It never adds to an older saved schedule or changes registrations. If Workday requires sign-in or suspends a hidden window, the export pauses with a recovery action. An interrupted export may leave a partially filled new saved schedule; uncertain writes are verified rather than automatically repeated.

## Single purpose

Plan schedules using user-selected WashU Workday course sections, including transferring a chosen BearPlans result into a new Workday saved schedule.

## Permission justifications

- `storage`: Keeps imported sections, the selected server, and the latest export's name, term, selected sections, new saved-schedule identifier, and progress on the user's device.
- `*.myworkday.com`: Imports matching course sections on WashU Workday. After confirmation in BearPlans, operates only the assigned Workday window to create and fill a new saved schedule. Registration actions are never submitted.
- `bearplans.pythonanywhere.com`: Sends course information for schedule generation and connects the site's user-confirmed Add to Workday action to the extension.
- Optional `localhost` access: Supports local development only and is requested from the user when they explicitly save a local server URL.

## Privacy

After deploying the site, use `https://bearplans.pythonanywhere.com/privacy` as the public privacy policy URL. Declare course names, section identifiers, meeting times, instructor names, locations, and user-provided saved-schedule names as data handled for the extension's scheduling purpose. Declare that the data is not sold, used for advertising, or used outside the single purpose. Generation sends course data to the BearPlans server; do not declare that all data stays on-device.

## Website and support

- Website: `https://bearplans.pythonanywhere.com`
- Setup and support: `https://bearplans.pythonanywhere.com/extension`
- Contact: `bearplansofficial@gmail.com`

These URLs must be live before submission. See `../RELEASE_CHECKLIST.md` for publishing and homepage configuration. WashU authentication is required for live course access; provide safe reviewer instructions without sharing personal credentials or MFA codes.

## Assets

- Store icon: `icons/icon-128.png`
- Screenshot: `dist/store-assets/schedule-generation-1280x800.png`
- Small promo tile: `dist/store-assets/small-promo-440x280.png`
