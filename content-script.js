(() => {
  if (window.__paperDownloadCrxContentLoaded) {
    return;
  }
  window.__paperDownloadCrxContentLoaded = true;

  const scriptId = "paper-download-crx-page-script";

  function injectPageScript() {
    if (document.getElementById(scriptId)) {
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = chrome.runtime.getURL("injected-page.js");
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectPageScript, { once: true });
  } else {
    injectPageScript();
  }
})();
