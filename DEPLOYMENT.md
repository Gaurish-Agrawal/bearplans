# BearPlans deployment

The Chrome extension defaults to `https://bearplans.pythonanywhere.com` and requires the Flask routes in this project, including `/api/workday/health` and `/api/workday/generate`.

## PythonAnywhere

1. Upload and extract `dist/bearplans-site-deploy-v1.2.1.zip` into a project directory in the PythonAnywhere account. Back up existing shared schedules first.
2. Create or update the PythonAnywhere web app for the public BearPlans domain.
3. Create a virtual environment and install `requirements.txt`.
4. Point the WSGI file at this project:

   ```python
   import os
   import sys

   project_path = "/home/YOUR_USERNAME/bearplans"
   os.chdir(project_path)
   if project_path not in sys.path:
       sys.path.insert(0, project_path)

   from app import app as application
   application.config.update(SESSION_COOKIE_SECURE=True, SESSION_COOKIE_SAMESITE="Lax")
   ```

5. Set a persistent, private `FLASK_SECRET_KEY` in the deployment environment before importing the app. Never put the value into the distributable ZIP.
6. Map `/static/` to the project's `static` directory, then reload the web app.
7. Confirm `https://bearplans.pythonanywhere.com/api/workday/health` returns:

   ```json
   {"apiVersion": 1, "status": "ok"}
   ```

Do not publish the extension until this health check passes. The extension popup also includes **Connection settings > Test connection**.

Generated results are currently kept in process-local memory. Use one worker for an initial limited test, or add shared result storage before running multiple workers. See `RELEASE_CHECKLIST.md` for scaling, security, and live acceptance checks; a passing health endpoint is not proof of production readiness.

## Homepage setup and privacy

The home page links to `/extension`, with installation, a read-only connection check, Workday steps, and troubleshooting. `/privacy` is the public privacy notice. Contact and Instagram links remain on the homepage and are also on these pages.

Until `CHROME_WEB_STORE_URL` is set to an approved store listing, the guide offers a clearly labeled manual preview download. `package-site.sh` rebuilds that download from the unchanged extension source. Run packaging locally with Node.js and zip/unzip installed, then upload the resulting site ZIP; these build tools are not needed by the hosted Flask app.

After store approval, set `CHROME_WEB_STORE_URL` to the actual HTTPS URL at `chromewebstore.google.com/detail/...` before importing the app and reload PythonAnywhere. The homepage then shows **Add to Chrome** and the guide hides manual preview installation. Never use the local unpacked extension ID or a placeholder as the public listing.

## Extension upload

Upload `dist/bearplans-workday-importer-v1.3.1.zip` to the Chrome Web Store dashboard. The ZIP has `manifest.json` at its root. Use the live `/privacy` page for the privacy policy URL and `workday-extension/CHROME_WEB_STORE.md` for listing guidance.

Deploy the site update and extension together. Verify that a generated timetable shows **Add to Workday**, opens the name and academic-period dialog, and connects to the updated extension. Test a fresh schedule for the intended semester; older imported sections may have different current meeting times and will be rejected safely.

The exporter creates a new Workday saved schedule only. It never registers, drops courses, or selects an old saved schedule as its destination. A paused export can leave its newly created schedule partially filled, so inspect that new schedule before retrying after an unverified write.
