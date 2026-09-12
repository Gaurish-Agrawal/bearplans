(() => {
  const panel = document.querySelector("[data-connection-check]");
  if (!panel) return;
  const status = document.getElementById("connection-status");
  const help = document.getElementById("connection-help");
  const button = document.getElementById("check-extension");
  const channel = "bearplans-workday-export";
  let checking = false;
  const desktopChrome = /Chrome\//.test(navigator.userAgent)
    && !/Android|Mobile|Edg\/|OPR\//.test(navigator.userAgent);

  function extensionCheck() {
    return new Promise(resolve => {
      const requestId = `setup-${crypto.randomUUID()}`;
      const finish = result => {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(result);
      };
      const onMessage = event => {
        if (event.source !== window || event.origin !== location.origin
          || event.data?.channel !== channel || event.data.direction !== "response"
          || event.data.requestId !== requestId) return;
        finish(event.data.response || { ok: false });
      };
      const timer = setTimeout(() => finish(null), 4500);
      window.addEventListener("message", onMessage);
      // CONTEXT is read-only: installation checks must never start or resume a save.
      window.postMessage({ channel, direction: "request", action: "CONTEXT", requestId }, location.origin);
    });
  }

  async function serverCheck() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch("/api/workday/health", { cache: "no-store", signal: controller.signal });
      if (!response.ok) return false;
      const data = await response.json();
      return data.status === "ok" && data.apiVersion === 1;
    } catch { return false; }
    finally { clearTimeout(timer); }
  }

  function show(state, title, detail) {
    panel.dataset.state = state;
    status.textContent = title;
    help.textContent = detail;
  }

  async function check() {
    if (checking) return;
    if (!desktopChrome) {
      show("browser", "Open this guide in desktop Google Chrome.", "Extension setup is not available in this browser. You can still use the website scheduler.");
      document.querySelectorAll("[data-desktop-install], [data-beta-install]").forEach(element => { element.hidden = true; });
      return;
    }
    checking = true;
    button.hidden = false;
    button.disabled = true;
    show("checking", "Checking your connection...", "No courses or Workday saved schedules will be changed.");
    try {
      const extension = await extensionCheck();
      const server = await serverCheck();
      if (!server) {
        show("error", "This BearPlans server is not ready.", "The scheduling service is unavailable. Check that the local server is running, or contact BearPlans if you are on the public site.");
      } else if (extension?.ok === true) {
        show("connected", "Extension connected. You are ready to use Workday.", "BearPlans responded and this server is available. Continue with step 2 below.");
      } else if (extension) {
        show("error", "Extension found, but it could not connect here.", "Reload this page after updating. In the extension popup, check Connection settings and use the server shown under help below.");
      } else {
        show("missing", "Extension not detected on this page.", "Install or enable BearPlans, allow it on this site, then reload this page and check again. Older extension versions may need an update.");
      }
    } finally {
      checking = false;
      button.disabled = false;
    }
  }
  button.addEventListener("click", check);
  window.addEventListener("focus", check);
  check();
})();
