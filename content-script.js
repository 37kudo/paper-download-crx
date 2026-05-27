(() => {
  if (window.__paperDownloadCrxContentLoaded) {
    return;
  }
  window.__paperDownloadCrxContentLoaded = true;

  const scriptId = "paper-download-crx-page-script";
  const LEGACY_UPLOAD_ENDPOINT = "http://127.0.0.1:8766/upload";
  const DEFAULT_UPLOAD_ENDPOINT = "http://140.245.38.221:8766/upload";

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

  function stripQuotes(value) {
    return String(value || "").trim().replace(/^"|"$/g, "");
  }

  function decodeHeaderBytes(value, encoding) {
    try {
      const bytes = Uint8Array.from(stripQuotes(value), (char) => char.charCodeAt(0) & 0xff);
      return new TextDecoder(encoding).decode(bytes).trim();
    } catch (_error) {
      return "";
    }
  }

  function decodePercentValue(value, encoding) {
    try {
      const text = stripQuotes(value);
      const bytes = [];
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === "%" && index + 2 < text.length) {
          const byte = Number.parseInt(text.slice(index + 1, index + 3), 16);
          if (!Number.isNaN(byte)) {
            bytes.push(byte);
            index += 2;
            continue;
          }
        }
        bytes.push(text.charCodeAt(index) & 0xff);
      }
      return new TextDecoder(encoding).decode(new Uint8Array(bytes)).trim();
    } catch (_error) {
      return "";
    }
  }

  function hasMojibake(value) {
    return /[脙脗脜茫盲氓忙莽猫茅]|閿焲锟絴閻祙閸閸殀閵唡缁攟缂億鐏弢鐔皘瑭獆[\u0000-\u001f\u007f]/.test(value);
  }

  function extensionFromName(name) {
    const match = String(name || "").match(/(\.[A-Za-z0-9]{1,8})$/);
    return match ? match[1] : "";
  }

  function extensionFromContentType(contentType) {
    const type = String(contentType || "").split(";")[0].trim().toLowerCase();
    const map = {
      "application/pdf": ".pdf",
      "application/msword": ".doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
      "application/vnd.ms-excel": ".xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "text/plain": ".txt",
      "application/zip": ".zip",
    };
    return map[type] || "";
  }

  function fileNameFromDirectory(directory, extension) {
    const parts = String(directory || "")
      .split(/[\\/]+/)
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const leaf = parts[parts.length - 1] || "";
    if (!leaf || hasMojibake(leaf)) {
      return "";
    }

    const safe = leaf.replace(/[\\/:*?"<>|]+/g, "_").trim();
    if (!safe) {
      return "";
    }

    return extension && !safe.toLowerCase().endsWith(extension.toLowerCase())
      ? `${safe}${extension}`
      : safe;
  }

  function repairFileName(value) {
    const name = stripQuotes(value);
    if (!name) {
      return "";
    }

    if (/%[0-9a-f]{2}/i.test(name)) {
      const utf8Name = decodePercentValue(name, "utf-8");
      if (utf8Name && !hasMojibake(utf8Name)) {
        return utf8Name;
      }

      const gbName = decodePercentValue(name, "gb18030");
      if (gbName) {
        return gbName;
      }
    }

    const gbName = decodeHeaderBytes(name, "gb18030");
    if (gbName && gbName !== name && /[\u4e00-\u9fff]/.test(gbName)) {
      return gbName;
    }

    if (hasMojibake(name)) {
      const utf8Name = decodeHeaderBytes(name, "utf-8");
      if (utf8Name && !hasMojibake(utf8Name)) {
        return utf8Name;
      }
    }

    return name;
  }

  function guessFileName(response, fallback) {
    const disposition = response.headers.get("content-disposition") || "";
    const encodedMatch = disposition.match(/filename\*=([^']*)'[^']*'([^;]+)/i);
    if (encodedMatch) {
      const encoding = encodedMatch[1] || "utf-8";
      const decoded = decodePercentValue(encodedMatch[2], encoding);
      if (decoded) {
        return decoded;
      }
    }

    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (plainMatch) {
      return repairFileName(plainMatch[1]) || fallback;
    }

    return fallback;
  }

  function postProgress(requestId, progress) {
    if (!requestId) {
      return;
    }

    window.postMessage({
      source: "paper-download-crx-content",
      type: "UPLOAD_PAPERS_PROGRESS",
      requestId,
      progress,
    }, location.origin);
  }

  function uploadForm(endpoint, form, requestId) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          postProgress(requestId, { label: "涓婁紶涓?.." });
          return;
        }

        const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        postProgress(requestId, {
          phase: "upload",
          loaded: event.loaded,
          total: event.total,
          percent,
          label: `涓婁紶 ${percent}%`,
        });
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`涓婁紶鏈嶅姟杩斿洖 HTTP ${xhr.status}${xhr.responseText ? `: ${xhr.responseText}` : ""}`));
          return;
        }

        try {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } catch (_error) {
          resolve({});
        }
      };

      xhr.onerror = () => reject(new Error("涓婁紶澶辫触锛岃纭涓婁紶鏈嶅姟鍙互璁块棶"));
      xhr.ontimeout = () => reject(new Error("涓婁紶瓒呮椂锛岃纭涓婁紶鏈嶅姟鍙互璁块棶"));
      xhr.open("POST", endpoint);
      xhr.timeout = 30 * 60 * 1000;
      xhr.send(form);
    });
  }

  async function uploadPapers(request, requestId) {
    const items = Array.isArray(request.items) ? request.items : [];
    if (!items.length) {
      throw new Error("娌℃湁鍙笂浼犵殑搴曠");
    }

    const form = new FormData();
    form.append("sourceUrl", location.href);
    const uploadedItems = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      postProgress(requestId, {
        phase: "download",
        current: index + 1,
        total: items.length,
        label: `鍑嗗 ${index + 1}/${items.length}`,
      });

      const response = await fetch(item.url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`涓嬭浇搴曠澶辫触 ${item.id || index + 1}: HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const fallbackName = `${item.kind || "paper"}-${item.id || index + 1}.bin`;
      const itemFileName = repairFileName(item.name || "");
      const responseFileName = guessFileName(response, fallbackName);
      const extension = extensionFromName(itemFileName) ||
        extensionFromName(responseFileName) ||
        extensionFromContentType(response.headers.get("content-type")) ||
        extensionFromName(fallbackName);
      const directoryFileName = fileNameFromDirectory(item.directory, extension);
      const fileName = itemFileName && !hasMojibake(itemFileName)
        ? itemFileName
        : responseFileName && !hasMojibake(responseFileName)
          ? responseFileName
          : directoryFileName || fallbackName;
      uploadedItems.push({
        id: item.id,
        kind: item.kind,
        url: item.url,
        fileName,
        directory: item.directory || "",
      });
      form.append("files", blob, fileName);
    }

    form.append("payload", JSON.stringify({
      createdAt: new Date().toISOString(),
      projectName: request.projectName || "",
      sourceUrl: location.href,
      mode: request.mode || "",
      fileNames: uploadedItems.map((item) => item.fileName),
      items: uploadedItems,
    }));
    form.append("fileNames", JSON.stringify(uploadedItems.map((item) => item.fileName)));

    const { uploadEndpoint } = await chrome.storage.local.get({
      uploadEndpoint: DEFAULT_UPLOAD_ENDPOINT,
    });
    const savedEndpoint = String(uploadEndpoint || DEFAULT_UPLOAD_ENDPOINT).trim() || DEFAULT_UPLOAD_ENDPOINT;
    const endpoint = savedEndpoint === LEGACY_UPLOAD_ENDPOINT ? DEFAULT_UPLOAD_ENDPOINT : savedEndpoint;

    postProgress(requestId, {
      phase: "upload",
      percent: 0,
      label: "涓婁紶 0%",
    });

    return uploadForm(endpoint, form, requestId);
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
      const result = await uploadPapers(message.payload || {}, message.requestId);
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
