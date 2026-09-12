# BearPlans

Course-schedule planning for Washington University in St. Louis.

- Website: https://bearplans.pythonanywhere.com/
- Chrome installation and guide: https://bearplans.pythonanywhere.com/extension
- Privacy: https://bearplans.pythonanywhere.com/privacy

## Run locally

Use Python 3.10 or newer:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m flask --app app run --host 127.0.0.1 --port 5011
```

Open http://127.0.0.1:5011/. Configure a persistent private `FLASK_SECRET_KEY`
and secure session cookies for production; see [DEPLOYMENT.md](DEPLOYMENT.md).
Keep hosting credentials, environment files, and runtime shared schedules out of Git.

## Website themes

The website supports light and dark modes across the planner, results, dialogs,
and information pages. The `bearPlansTheme` local-storage preference persists in
the same browser and syncs between its open tabs. It does not sync across devices.
The toggle remains usable if storage is unavailable, but that browser cannot
retain the preference. Theme changes do not alter saved-schedule data.

The Chrome extension is maintained separately in `workday-extension/`. The
September 2026 website theme update does not change its behavior or package.

## Tests

```sh
python -m unittest discover -s tests -v
node tests/theme.browser.cjs
node tests/extension-setup.browser.cjs
```

Browser tests require Playwright and Chrome. Set `BEARPLANS_TEST_URL` for the
test server and `CHROME_PATH` for a different Chrome executable. Run the full
browser suite against a local test server: it exercises schedule sharing and
generates test artifacts under `artifacts/`.

## Repository archive

`archive/2026-09-12-before-website-refresh/` preserves every tracked file from
the previous `main` revision, `b13be23ee644dcdaa1eb1c5b1cd1189b7fd7f0dc`, with
its relative path and contents unchanged. It is historical reference, not the
application entry point. The current application is at the repository root.
