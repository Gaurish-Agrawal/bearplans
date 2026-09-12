# BearPlans public release checklist

## Current release candidate

- Website: `dist/bearplans-site-deploy-v1.2.1.zip`.
- Extension: `dist/bearplans-workday-importer-v1.3.1.zip`. The academic period is transferred automatically, and the Workday search touches only the 2025-2026 academic-year checkbox.
- Homepage entry: `/`; setup and troubleshooting: `/extension`; privacy: `/privacy`.
- The setup page checks the extension with a read-only message. It never starts, resumes, or stops a Workday save.
- Until a real store listing URL is configured, installation is explicitly a manual preview. No automatic installation or store approval is implied.
- Public health check and schedule generation passed on September 4, 2026 after deployment. The preview ZIP download still returns HTTP 404 and must be repaired separately.
- The owner reported submitting version 1.3.0 for review on September 4, 2026. Version 1.3.1 is a newer local release candidate and has not been uploaded. Verify the dashboard state before replacing or updating the submitted package.

## 1. Deploy the website first

- Follow `DEPLOYMENT.md`. Set a persistent private session secret, use HTTPS and the WSGI server, and leave debug mode off.
- Back up existing shared schedules before deploying. Do not replace user data directories with an empty release directory.
- Confirm `/api/workday/health` returns HTTP 200 JSON with `status: ok` and `apiVersion: 1` from the public domain, not localhost.
- Confirm home, setup, privacy, static files, preview ZIP download, schedule generation, local Save, sharing, and Home navigation on the deployed site.
- Production constraint: generated results are currently process-local dictionaries. Multiple workers can lose access to each other's results. Use one worker for a limited initial test deployment, or move the caches to shared storage before enabling multiple workers. Process restarts invalidate temporary results. Health checks alone do not test this.
- Before broad promotion, verify expected concurrent usage, request throttling, cache memory limits, logs/alerts, dependency security updates, backups, and restore procedures. These operational controls are not supplied by this UI update.

## 2. Prepare the Chrome Web Store listing

- Register a developer account, complete its requirements and enable two-step verification. Account registration/payment and acceptance of terms must be handled by the account owner.
- Upload the extension ZIP. Use `workday-extension/CHROME_WEB_STORE.md` for the description, single purpose, and permission explanations.
- Set website to `https://bearplans.pythonanywhere.com`, support to `https://bearplans.pythonanywhere.com/extension`, and privacy to `https://bearplans.pythonanywhere.com/privacy` once they are live. Review that the policy matches the deployed hosting/logging configuration.
- Declare website content and user-provided schedule information consistently with actual behavior. Do not claim that no data leaves the device: generating schedules sends course information to BearPlans.
- Review the existing icon and store assets in `dist/store-assets`. Supply a 128px icon, 440x280 small promotional image, and at least one 1280x800 or 640x400 screenshot. Use current screens without personal account data.
- Provide reviewer instructions for WashU-only access. Do not share a personal WashU password or MFA code. Arrange an authorized test account or safe demonstration with the reviewer if required.
- Submit for review. Prefer deferred publication until the live-site test passes. Store approval and its timing are not guaranteed.

## 3. Enable the homepage installation button

After approval, set the deployment environment before importing the Flask app:

```python
os.environ["CHROME_WEB_STORE_URL"] = "https://chromewebstore.google.com/detail/bearplans/ACTUAL_STORE_ITEM_ID"
```

Replace the placeholder with the approved item's actual 32-character ID, then reload the site. Do NOT use the unpacked development extension ID. Invalid or absent URLs leave the site in preview mode.

The homepage and guide then show **Add to Chrome**, which opens the real store listing. The manual preview instructions are hidden. Chrome handles installation and consent; the website cannot silently install an extension.

## 4. Final public acceptance test

- Use a clean desktop Chrome profile with only the store-installed extension, no unpacked duplicate, no local server, and default public connection settings.
- From the homepage, install from the store, return to `/extension`, reload and confirm the connection check succeeds.
- Sign into WashU normally. In Find Course Sections choose the intended semester, add at least two courses with multiple sections, and verify all expected alternatives are imported.
- Generate, inspect conflict-free combinations, save one in BearPlans and reopen it from Home > Saved Schedules.
- Add one chosen schedule to Workday under a unique test name. Verify its exact sections, meeting times and academic period. Confirm registrations are unchanged. Only delete this test schedule if its owner approves.
- Exercise expired login, a stopped/paused save, duplicate-click protection, no valid combinations, stale course times, site unavailability, and denied extension site access. Confirm errors are actionable and no uncertain write is repeated.
- Revisit the guide in another browser and on a phone. It must explain desktop Chrome requirements without blocking the website scheduler.

## Official references

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Register a developer account](https://developer.chrome.com/docs/webstore/register)
- [Chrome Web Store images](https://developer.chrome.com/docs/webstore/images)
- [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Flask on PythonAnywhere](https://help.pythonanywhere.com/pages/Flask/)
