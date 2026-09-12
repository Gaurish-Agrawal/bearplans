(() => {
  if (window.top !== window || window.__bearPlansExportBridge) return;
  window.__bearPlansExportBridge = true;
  const channel = "bearplans-workday-export";
  const actions = new Set(["CONTEXT", "START", "STATUS", "OPEN", "STOP", "RESUME"]);
  window.addEventListener("message", event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.channel !== channel
      || message.direction !== "request" || !actions.has(message.action)
      || typeof message.requestId !== "string" || message.requestId.length > 80) return;
    const reply = response => {
      window.postMessage({
        channel, direction: "response", requestId: message.requestId,
        response
      }, location.origin);
    };
    const unavailable = { ok: false, error: "Reload this BearPlans page after updating the extension." };
    try {
      chrome.runtime.sendMessage({ type: `BP_EXPORT_${message.action}`, payload: message.payload }, response => {
        reply(chrome.runtime.lastError ? unavailable : response);
      });
    } catch { reply(unavailable); }
  });
})();
