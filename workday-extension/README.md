# BearPlans Workday Importer

Chrome extension that imports every usable section for a user-selected WashU Workday course into BearPlans and generates conflict-free schedules from those options.

The website homepage now links to `/extension` for guided installation, a read-only connection check, and troubleshooting. See `../RELEASE_CHECKLIST.md` before publishing. The public store button is enabled only after configuring the approved listing URL; until then the guide labels the manual download as a preview.

## Install locally

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click **Load unpacked**.
4. Select this `workday-extension` folder.
5. Refresh any Workday tabs that were already open.

The release build uses `https://bearplans.pythonanywhere.com`. For local development, start the local site, open the extension popup, expand **Connection settings**, and click **Use local server**. Allow local access when Chrome asks, then click **Test connection**. This saves `http://127.0.0.1:5001`; server changes apply to the next Generate click without refreshing Workday or losing imported courses.

When updating an unpacked extension, click its reload button at `chrome://extensions`. Refresh Workday once to load the updated page controls. Do not remove the extension, since that deletes its saved imports and settings.

If generation reports a missing schedule API (404), the chosen server does not have the BearPlans backend running. Opening the local site in a browser does not change the extension's saved server. Select the local server in **Connection settings** for testing; deploy the backend before using the public server.

## Use

1. Sign in to WashU Workday normally.
2. Open **Academics > Planning and Registration > Find Course Sections**, then choose the intended undergraduate academic period for the courses you are planning.
3. Click a search result to open Workday's **View Course Section** window.
4. Click **Add course to BearPlans** beside Workday's course actions. The extension finds every result with the same course code and reads all of its usable sections automatically. You do not open each section yourself.
5. Repeat once for each course, then click **Generate schedules** in the BearPlans panel. Every imported section is treated as an alternative for its course.
6. On the generated schedule page, click **Save** on any schedule. It will appear under **Saved Schedules** on the BearPlans home page in that browser.

The extension expands only matching result rows. If a matching row does not expose its meeting data inline, the extension opens that section's detail window automatically, reads it, and restores the originally selected section. Explicitly closed, cancelled, or unscheduled sections are skipped. Unrelated search results and Academics Overview are never imported. The earlier Start Registration course-list flow remains available as a fallback, but it is not required.

## Privacy and safety

The extension does not request, read, store, or submit Workday credentials or MFA codes. It cannot register for or drop courses. After the user explicitly clicks **Add course to BearPlans**, it reads only matching course-section results and their detail windows, or the optional Start Registration fallback. See `PRIVACY.md` for the release disclosure.

## Save a generated schedule to Workday

Choose **Add to Workday** above a schedule, enter only a new saved-schedule name, and confirm. BearPlans carries the academic period from the imported sections automatically. The extension enables only the **2025-2026** academic-year filter in its Workday task window and leaves academic-period and level filters unchanged. It checks each exact section, period, and meeting time before creating a new saved schedule.

Workday may suspend its forms when its window is fully hidden or minimized. **Open Workday** brings it forward and continues a paused export. Login happens in Workday, never in BearPlans. **Stop** prevents further steps but does not delete the new schedule or undo verified additions. An uncertain section addition is checked through the new schedule's read-only view rather than submitted twice. Uncertain schedule creation requires manual inspection because its new identifier may not have been returned.

The extension and updated BearPlans site must be deployed together. The ZIP does not deploy the Flask server. Confirm the public server's `/api/workday/health` endpoint and timetable toolbar before publishing.

## Test

From the project root:

```sh
node workday-extension/content.test.js
node workday-extension/background.test.js
node workday-extension/popup.test.js
node workday-extension/browser.test.js
node workday-extension/export.test.js
node workday-extension/export-browser.test.js
python -m unittest discover -s tests -v
```

`browser.test.js` runs Chrome headlessly with a temporary profile and does not touch the user's normal Chrome session.
`export-browser.test.js` requires Playwright and a local BearPlans server. It defaults to port 5001; set `BEARPLANS_TEST_URL` to use another test address. It tests the name-only dialog at desktop and mobile sizes, exact-period transfer, checkbox isolation, and saved-schedule guardrails; fixture results do not replace live Workday verification.

## Package

```sh
./workday-extension/package.sh
```

The upload-ready ZIP is written to `dist/` with `manifest.json` at the ZIP root.
