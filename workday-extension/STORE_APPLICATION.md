# Chrome Web Store application draft

Prepared September 4, 2026. This document is not evidence of upload, review, approval, or publication. The developer dashboard must be completed and saved separately. The owner will review and press Submit for review.

## Package

- File: `dist/bearplans-workday-importer-v1.3.1.zip`
- Name: BearPlans Workday Importer
- Version: 1.3.1
- Language: English
- Category preference: Education, if available; otherwise the closest scheduling/productivity category offered in the dashboard.
- Price: Free
- Distribution: Public, all supported regions, so WashU students can install while away from campus.
- Mature content: No
- Remote code: No. Extension JavaScript is bundled in the ZIP. The server returns schedule data and result URLs, not code executed by the extension.

## Detailed description

Plan your WashU courses in BearPlans without downloading or importing JSON files.

ADD A COURSE ONCE, COMPARE ITS SECTIONS
In WashU Workday, open Academics Hub > Planning and Registration > Find Course Sections. Choose the intended undergraduate academic period, search for a course, and open one course-section result. Click Add course to BearPlans. The extension gathers the matching usable sections and their meeting patterns automatically. Repeat once per course, then choose Generate schedules to compare conflict-free combinations on BearPlans.

KEEP THE SCHEDULE YOU CHOOSE
Save a result in BearPlans to revisit it in the same browser. To create a new Workday saved schedule, choose Add to Workday above that result, enter a name, and confirm. BearPlans carries the academic period from the imported courses automatically, checks the exact course sections and meeting times, creates the new saved schedule, and verifies the saved sections.

YOU STAY IN CONTROL
This extension plans and saves schedules; it does not register for courses, drop courses, or change existing registrations. It does not add to an older saved schedule. Workday availability, prerequisites, waitlists, and registration requirements still apply. Missing or changed meeting times can prevent a schedule from being generated or saved.

If sign-in is needed, sign in through WashU Workday normally. BearPlans does not collect passwords or verification codes. Keep the Workday save window visible until it finishes. If an export is interrupted, follow the recovery message; the new schedule may already contain some sections.

PRIVACY
Imported courses and the latest Workday-save progress are stored in Chrome extension storage. Generating schedules sends course information to the BearPlans server. No advertising, sale of course data, or credential collection.

Requires desktop Google Chrome and access to Washington University in St. Louis's Workday course search. This is a BearPlans scheduling tool for use with Workday, not a registration service or a Workday product.

Setup and support: https://bearplans.pythonanywhere.com/extension
Privacy: https://bearplans.pythonanywhere.com/privacy

## Single purpose

Help Washington University in St. Louis students plan course schedules using their selected Workday course sections, including saving a chosen BearPlans result into a new Workday saved schedule.

## Permission explanations

### storage

Stores imported course and section information, including academic period, locally so users can build a course list across Workday pages. Stores the chosen BearPlans server using Chrome sync storage. Stores only the latest export's requested name, derived academic period, selected sections, new saved-schedule identifier and progress locally so interrupted writes can be verified rather than duplicated. No passwords, MFA codes or browsing-history records are stored.

### Host permissions

Workday hosts (myworkday.com, www.myworkday.com and subdomains): allow content scripts to read course-section information from the user's selected course results and insert BearPlans planning controls. On the WashU tenant, a user-confirmed Add to Workday action operates only the separately assigned task tab to create and fill a new saved schedule. The extension never submits registration or drop actions.

bearplans.pythonanywhere.com: sends imported course data to the scheduling API after Generate schedules and bridges the website's confirmed Add to Workday action to the extension. No unrelated web hosts receive course data.

Optional localhost and 127.0.0.1 hosts: support local development. This access is requested only when the user explicitly chooses a local server in Connection settings. It is not required for normal public use.

### Remote code explanation, if requested

All JavaScript executed by the extension is packaged locally in the uploaded ZIP. No remote scripts, eval-based downloads, external executable modules or remotely loaded extension libraries are used. HTTPS requests to BearPlans return JSON schedule results and same-origin timetable URLs.

## Data-use declarations for owner review

Select Website content: course names, section codes, instructors, room/building names, days/times, availability, and saved-schedule form information.

Select Personally identifiable information conservatively: instructor names appear in course information, and user-entered schedule names and new Workday saved-schedule identifiers can relate to an individual. BearPlans does not collect account credentials or contact details through the extension.

Select Location conservatively because the dashboard explicitly includes IP addresses in this category and ordinary requests reach the hosting provider's access logs, as described in the privacy policy. No device GPS or geolocation API is used. Course classroom locations are academic website content, not sensed device location.

Do not select authentication information, financial/payment information, health information, personal communications, web history, or user-activity tracking.

The three limited-use certifications are supported by the current code: data is not sold/transferred outside allowed uses; not used for unrelated purposes; and not used for creditworthiness/lending decisions. The owner should review these declarations before submission and verify that deployed service practices remain consistent.

Privacy policy URL: https://bearplans.pythonanywhere.com/privacy
Homepage URL: https://bearplans.pythonanywhere.com
Support URL: https://bearplans.pythonanywhere.com/extension
Contact email: bearplansofficial@gmail.com
Official verified URL: select only if Google already confirms domain ownership; do not claim verification merely because the page is live.

## Reviewer test instructions

BearPlans is a desktop Chrome course-planning extension for Washington University in St. Louis's Workday tenant. The public site and its setup/privacy pages are accessible without a BearPlans account. WashU Workday course search requires an authorized university account and university-managed authentication. No developer bypass account exists, and no personal password or MFA code is supplied in this draft. Please contact bearplansofficial@gmail.com if additional authorized access or a demonstration is required.

1. Install this uploaded extension. Keep the default server, https://bearplans.pythonanywhere.com. Open the extension popup, expand Connection settings, and choose Test connection. The API should respond successfully.
2. Open https://bearplans.pythonanywhere.com/extension in the same Chrome profile. Its read-only connection check should report the extension connected. The privacy page is linked in the footer.
3. With an authorized WashU account, open https://www.myworkday.com/wustl/d/home.htmld. Navigate to Student Self Service > Academics Hub > Planning and Registration > Find Course Sections. Select the current intended undergraduate academic period.
4. Search for a course, open one section result, and click Add course to BearPlans. Confirm that matching usable sections for the same course are collected automatically. Add a second course, then choose Generate schedules in the BearPlans panel.
5. On a generated result, Save stores the schedule locally in this browser. Home > Saved Schedules reopens it.
6. Only with permission from the test account's owner: click Add to Workday above one chosen result, provide a unique test name, and confirm. The academic period is transferred automatically from the imported sections. Keep the Workday task window visible. The extension verifies exact section identifiers and meeting times, creates a new saved schedule, and verifies the resulting rows. It does not register, drop, or modify existing registrations. Do not use Register buttons while testing this extension.
7. If login or changed course times interrupt the process, inspect the error/recovery message. Stop prevents further steps but does not delete a partially completed new saved schedule.

The store screenshots show the actual deployed BearPlans UI using demonstration course data. The save screenshot is an unsubmitted confirmation form, not a claim of registration or a completed Workday save.

## Owner-only decisions

Do not fabricate a publisher identity, business address, trader/non-trader declaration, domain verification, tax details, or reviewer credentials. Any required identity, registration fee, terms acceptance, verification or legal status must be completed/confirmed by the owner. Do not press Submit for review or Publish on the owner's behalf.
