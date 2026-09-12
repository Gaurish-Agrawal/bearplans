# BearPlans Chrome Web Store draft

Verified September 4, 2026 in the signed-in publisher dashboard.

## Review link

https://chrome.google.com/webstore/devconsole/4a3be9bc-3d8f-472c-a0eb-af5a068cd77c/doaimfkcglkgaaadchpadhkbihhhnaja/edit/listing

- Item: BearPlans Workday Importer
- Item ID: `doaimfkcglkgaaadchpadhkbihhhnaja`
- Version: 1.3.0
- State last verified in the dashboard: **Draft, unpublished**. The owner later reported submitting version 1.3.0 for review; verify the live dashboard for current status.
- The existing Perflect listing was not modified.

## Completed and checked after reload

- Extension ZIP uploaded and accepted. Package page shows version 1.3.0.
- Description saved (2,124 characters).
- Category: Education. Language: English (United States).
- 128px icon, two current 1280x800 screenshots, and small promotional tile uploaded and displayed successfully.
- Homepage and support URLs saved. Verified publisher URL left unset because domain ownership was not verified through Google.
- Single purpose, storage explanation, and host permission explanation saved.
- Remote code: No.
- Data declarations: Personally identifiable information, Location, Website content. Location is declared conservatively because the dashboard includes IP addresses and the hosting service receives requests; the extension does not access device GPS.
- All three limited-use certifications selected, based on current implementation and policy. Owner should review before submission.
- Privacy policy: https://bearplans.pythonanywhere.com/privacy
- Free of charge, public visibility, all supported regions selected. These are draft distribution settings, not publication.
- Reviewer instructions saved. Username and password fields deliberately left blank. No personal credentials were uploaded.

## Saved reviewer instructions

Requires authorized WashU Workday access. Guide: https://bearplans.pythonanywhere.com/extension. Contact bearplansofficial@gmail.com if review access is needed. In Find Course Sections select an undergraduate term, open a result, click Add course to BearPlans; repeat and Generate schedules. Add to Workday creates a NEW saved schedule only; use a unique test name. No registrations or drops. No public test account is available; sign in through WashU normally.

Google may request authorized access or further demonstration before completing review. A ready-to-submit form is not store approval.

## Public-site checks

The public health endpoint, homepage, setup guide, privacy page, and required UI assets returned HTTP 200. Schedule generation and six subsequent reads of its result passed. Test screenshots used demonstration course data. No Workday saves or registration actions were performed during submission preparation.

Separate deployment issue: `/static/downloads/bearplans-workday-importer.zip` still returned HTTP 404. The public preview-download link needs the ZIP uploaded under the site's served `static/downloads` directory, or its static mapping corrected. This does not affect the extension ZIP already uploaded to the developer dashboard. Do not advertise the preview download until repaired.

## After owner review

The owner can press Submit for review in the dashboard. Review any final confirmation and publication-timing options there. No review timing or approval is guaranteed.

Only after approval/public availability, set `CHROME_WEB_STORE_URL` on the website to:

`https://chromewebstore.google.com/detail/bearplans-workday-importer/doaimfkcglkgaaadchpadhkbihhhnaja`

That URL is reserved by the created item ID; it is NOT currently a public install link. Do not enable the homepage store button before the item is available.

## Local handoff

Files in `dist/store-submission` include the uploaded extension ZIP, screenshots, icon, promotional tile, application copy, public test record and this status note.

Uploaded extension SHA-256:
`f1dcf4b46827d36deafbdac7b4f2e8ac245c61843f5ed086b919eecf41ab3475`

Use the inner `bearplans-workday-importer-v1.3.0.zip` for any future package upload, not the full handoff bundle. The bundle also contains documentation and graphics that do not belong in the extension package.

Version 1.3.1 is a newer local candidate that removes the academic-period prompt and limits automated search-filter interaction to the 2025-2026 academic-year checkbox. It requires the matching website deployment before upload and has not replaced the submitted 1.3.0 package.

Version 1.3.1 extension SHA-256:
`b457ebacafbccec6342ffbebcb195553dd2129d4d48ba2e0ea18048d57b8f106`
