(() => {
  if (window.__paperDownloadCrxContentLoaded) {
    return;
  }
  window.__paperDownloadCrxContentLoaded = true;

  const scriptId = "paper-download-crx-page-script";
  const DEFAULT_UPLOAD_ENDPOINT = "http://127.0.0.1:8766/upload";

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

  function guessFileName(response, fallback) {
    const disposition = response.headers.get("content-disposition") || "";
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
      try {
        return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ""));
      } catch (_err) {
        return utf8Match[1].replace(/^"|"$/g, "");
      }
    }

    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (plainMatch) {
      return plainMatch[1];
    }

    return fallback;
  }

  async function uploadPapers(request) {
    const items = Array.isArray(request.items) ? request.items : [];
    if (!items.length) {
      throw new Error("没有可上传的底稿");
    }

    const form = new FormData();
    form.append("sourceUrl", location.href);
    form.append("payload", JSON.stringify({
      createdAt: new Date().toISOString(),
      sourceUrl: location.href,
      mode: request.mode || "",
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        url: item.url,
      })),
    }));

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const response = await fetch(item.url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`下载底稿失败 ${item.id || index + 1}: HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const fallbackName = `${item.kind || "paper"}-${item.id || index + 1}.bin`;
      const fileName = guessFileName(response, fallbackName);
      form.append("files", blob, fileName);
    }

    const { uploadEndpoint } = await chrome.storage.local.get({
      uploadEndpoint: DEFAULT_UPLOAD_ENDPOINT,
    });
    const endpoint = String(uploadEndpoint || DEFAULT_UPLOAD_ENDPOINT).trim() || DEFAULT_UPLOAD_ENDPOINT;

    const uploadResponse = await fetch(endpoint, {
      method: "POST",
      body: form,
    });

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text().catch(() => "");
      throw new Error(`上传服务返回 HTTP ${uploadResponse.status}${text ? `: ${text}` : ""}`);
    }

    return uploadResponse.json();
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin) {
      return;
    }

    const message = event.data;
    if (!message || message.source !== "paper-download-crx-page" || message.type !== "UPLOAD_PAPERS") {
      return;
    }

    try {
      const result = await uploadPapers(message.payload || {});
      window.postMessage({
        source: "paper-download-crx-content",
        type: "UPLOAD_PAPERS_RESULT",
        requestId: message.requestId,
        ok: true,
        result,
      }, location.origin);
    } catch (error) {
      window.postMessage({
        source: "paper-download-crx-content",
        type: "UPLOAD_PAPERS_RESULT",
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }, location.origin);
    }
  });
})();
