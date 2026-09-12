const DEFAULT_APP_URL = "https://bearplans.pythonanywhere.com";
const STORAGE_APP_URL = "bearPlansAppUrl";
const STORAGE_SECTIONS = "bearPlansWorkdaySections";
const ALLOWED_APP_HOSTS = new Set(["127.0.0.1", "localhost", "bearplans.pythonanywhere.com"]);

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function normalizeAppUrl(value) {
  const url = new URL(value || DEFAULT_APP_URL);
  if (!ALLOWED_APP_HOSTS.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("Use the BearPlans site or a local development server.");
  }
  return url.origin;
}

chrome.storage.sync.get({ [STORAGE_APP_URL]: DEFAULT_APP_URL }, result => {
  document.getElementById("appUrl").value = result[STORAGE_APP_URL] || DEFAULT_APP_URL;
});

chrome.storage.local.get({ [STORAGE_SECTIONS]: [] }, result => {
  const sections = Array.isArray(result[STORAGE_SECTIONS]) ? result[STORAGE_SECTIONS] : [];
  const courseCount = new Set(sections.map(section => section.courseCode).filter(Boolean)).size;
  const sectionCount = new Set(
    sections
      .filter(section => section.courseCode && section.section)
      .map(section => `${section.courseCode}|${section.section}`)
  ).size;
  setStatus(`${courseCount} course${courseCount === 1 ? "" : "s"} · ${sectionCount} section${sectionCount === 1 ? "" : "s"}`);
});

function saveServerAddress(address) {
  try {
    const value = normalizeAppUrl(address);
    document.getElementById("appUrl").value = value;
    const url = new URL(value);
    const saveServer = () => chrome.storage.sync.set({ [STORAGE_APP_URL]: value }, () => {
      const error = chrome.runtime.lastError;
      setStatus(error ? `Could not save server: ${error.message}` : `Server saved: ${value}.`);
    });

    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      chrome.permissions.request({ origins: [`${url.origin}/*`] }, granted => {
        const error = chrome.runtime.lastError;
        if (error) {
          setStatus(`Local server access failed: ${error.message}`);
          return;
        }
        if (!granted) {
          setStatus("Local server access was not granted.");
          return;
        }
        saveServer();
      });
      return;
    }

    saveServer();
  } catch (error) {
    setStatus(error.message);
  }
}

document.getElementById("save").addEventListener("click", () => {
  saveServerAddress(document.getElementById("appUrl").value.trim());
});

document.getElementById("local").addEventListener("click", () => {
  saveServerAddress("http://127.0.0.1:5001");
});

document.getElementById("open").addEventListener("click", () => {
  chrome.storage.sync.get({ [STORAGE_APP_URL]: DEFAULT_APP_URL }, result => {
    try {
      chrome.tabs.create({ url: normalizeAppUrl(result[STORAGE_APP_URL]) });
    } catch (error) {
      setStatus(error.message);
    }
  });
});

document.getElementById("test").addEventListener("click", async () => {
  try {
    const value = normalizeAppUrl(document.getElementById("appUrl").value.trim());
    setStatus("Checking connection...");
    const response = await fetch(`${value}/api/workday/health`);
    if (response.status === 404) throw new Error(`${value} is missing the BearPlans API (404).`);
    if (!response.ok) throw new Error(`${value} returned HTTP ${response.status}.`);
    const data = await response.json();
    if (data?.status !== "ok" || data.apiVersion !== 1) throw new Error(`${value} is not a compatible BearPlans server.`);
    setStatus(`Connection ready: ${value}.`);
  } catch (error) {
    setStatus(`Connection failed: ${error.message}`);
  }
});

document.getElementById("clear").addEventListener("click", () => {
  chrome.storage.local.set({ [STORAGE_SECTIONS]: [] }, () => {
    setStatus("Cleared imported courses.");
  });
});
