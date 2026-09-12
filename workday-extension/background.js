const DEFAULT_APP_URL = "https://bearplans.pythonanywhere.com";
const STORAGE_APP_URL = "bearPlansAppUrl";
const ALLOWED_APP_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "bearplans.pythonanywhere.com"
]);

function normalizeAppUrl(value) {
  const url = new URL(value || DEFAULT_APP_URL);
  if (!ALLOWED_APP_HOSTS.has(url.hostname)) {
    throw new Error(`Unsupported BearPlans host: ${url.hostname}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported BearPlans protocol: ${url.protocol}`);
  }
  return url.origin;
}

function resultUrl(appUrl, redirectPath) {
  const baseUrl = normalizeAppUrl(appUrl);
  const url = new URL(redirectPath, `${baseUrl}/`);
  if (url.origin !== baseUrl) {
    throw new Error("BearPlans returned an unsafe result URL.");
  }
  return url.href;
}

async function postWorkdayCourses(appUrl, payload) {
  const baseUrl = normalizeAppUrl(appUrl);
  let response;
  try {
    response = await fetch(`${baseUrl}/api/workday/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "error",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error(`Cannot reach ${baseUrl}. Check that the server is running and allowed in the extension's Connection settings.`);
  }

  if (response.status === 404) {
    throw new Error(`${baseUrl} is missing the schedule API (404). Open the BearPlans extension's Connection settings and select a running BearPlans server.`);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`${baseUrl} returned an invalid response (HTTP ${response.status}). Check the server in the extension's Connection settings.`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `${baseUrl} returned HTTP ${response.status}.`);
  }

  return data;
}

async function openGeneratedSchedules(appUrl, payload) {
  const data = await postWorkdayCourses(appUrl, payload);
  if (!data?.redirect) {
    throw new Error("BearPlans did not return a schedule page.");
  }

  await chrome.tabs.create({ url: resultUrl(appUrl, data.redirect) });
  return data;
}

async function generateFromSettings(payload) {
  // Read once per request: an open Workday tab may still have an older server URL.
  const settings = await new Promise((resolve, reject) => {
    chrome.storage.sync.get({ [STORAGE_APP_URL]: DEFAULT_APP_URL }, result => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(`Could not read the BearPlans server setting: ${error.message}`));
      else resolve(result);
    });
  });
  const baseUrl = normalizeAppUrl(settings[STORAGE_APP_URL]);
  return openGeneratedSchedules(baseUrl, payload);
}

if (globalThis.__BEARPLANS_BACKGROUND_TEST_HOOK__) {
  globalThis.__BEARPLANS_BACKGROUND_TEST_HOOK__ = {
    normalizeAppUrl,
    resultUrl,
    postWorkdayCourses,
    openGeneratedSchedules,
    generateFromSettings
  };
} else {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "BEARPLANS_GENERATE") {
      generateFromSettings(message.payload)
        .then(data => sendResponse({ ok: true, data }))
        .catch(error => sendResponse({ ok: false, error: error.message }));

      return true;
    }

    return false;
  });
}
