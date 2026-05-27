(() => {
  if (window.__paperDownloadCrxInjected) return;
  window.__paperDownloadCrxInjected = true;

  const BUTTON_ID = "paper-download-crx-download";
  const UPLOAD_BUTTON_ID = "paper-download-crx-upload";
  const HOLDER_ID = "paper-download-crx-download-holder";
  const DOWNLOAD_LABEL = "下载";
  const UPLOAD_LABEL = "上传";
  let uploadRequestSeq = 0;

  function getCtx() {
    return typeof ctx !== "undefined" && ctx ? ctx : `${location.origin}/wpcms`;
  }

  function toast(message) {
    if (window.layer && typeof window.layer.msg === "function") {
      window.layer.msg(message);
    } else {
      window.alert(message);
    }
  }

  function tableApi() {
    return window.layui && window.layui.table;
  }

  function getSelectedRows() {
    const api = tableApi();
    if (!api || typeof api.checkStatus !== "function") return [];
    const status = api.checkStatus("table2");
    return Array.isArray(status && status.data) ? status.data : [];
  }

  function getTableRows() {
    const api = tableApi();
    return api && api.cache && Array.isArray(api.cache.table2) ? api.cache.table2 : [];
  }

  function getRowFileId(row) {
    return row && (row.alfrescoFileId || row.afrescoFileId || row.fileId || row.nodeId || row.id);
  }

  function getSelectedFileIds() {
    return getSelectedRows().map(getRowFileId).filter((value) => typeof value === "string" && value.trim());
  }

  function getAllFileIds() {
    return getTableRows().map(getRowFileId).filter((value) => typeof value === "string" && value.trim());
  }

  function getCurrentFolderNodeId() {
    const treeNode = window.globaltree && window.globaltree.treeNode;
    return treeNode ? treeNode.c_alfr_id || "" : "";
  }

  function buildFileDownloadUrl(ids) {
    const base = getCtx();
    return ids.length > 1
      ? `${base}/emvc/cms/upload/downloads.mvc?nodeIds=${encodeURIComponent(ids.join("^"))}`
      : `${base}/emvc/cms/upload/download.mvc?nodeId=${encodeURIComponent(ids[0])}`;
  }

  function buildFolderDownloadUrl(nodeId) {
    return `${getCtx()}/emvc/cms/upload/download.mvc?nodeId=${encodeURIComponent(nodeId)}`;
  }

  function openFileDownload(ids) {
    if (ids.length > 200) {
      toast("最多只能下载 200 个文件");
      return;
    }
    window.location.href = buildFileDownloadUrl(ids);
  }

  function openFolderDownload(nodeId) {
    window.location.href = buildFolderDownloadUrl(nodeId);
  }

  function cleanFileName(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    const name = String(value).replace(/\s+/g, " ").replace(/[\\/:*?"<>|]+/g, "_").trim();
    return name && name !== "." && name !== ".." ? name : "";
  }

  function cleanProjectName(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).replace(/\s+/g, " ").replace(/[\\/:*?"<>|]+/g, "_").trim();
  }

  function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  function isBadFileName(value) {
    return !value || /[\u0000-\u001f\u007f\ufffd]|锟|鐵|鍥|鍚|銆|绔|缃|灏|浼佷笟|淇℃伅/.test(value);
  }

  function isUsableProjectName(value) {
    if (!value || isUuidLike(value)) return false;
    if (/^[0-9a-f]{24,}$/i.test(value) || /^[-_0-9a-z]{16,}$/i.test(value)) return false;
    return /[\u4e00-\u9fff]/.test(value) || value.length >= 3;
  }

  function firstRowValue(row, patterns) {
    if (!row || typeof row !== "object") return "";
    for (const [key, value] of Object.entries(row)) {
      if (!patterns.some((pattern) => pattern.test(key))) continue;
      const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
      if (text) return text;
    }
    return "";
  }

  function getRowFileName(row) {
    return cleanFileName(firstRowValue(row, [
      /文件名|文档名|底稿名|资料名/,
      /^file(name)?$/i,
      /file.?name/i,
      /doc.?name/i,
      /document.?name/i,
      /original.?name/i,
      /title/i,
      /^name$/i,
    ]));
  }

  function getRowDirectory(row) {
    return firstRowValue(row, [
      /所在目录|目录|路径/,
      /path/i,
      /folder/i,
      /catalog/i,
      /directory/i,
      /^dir$/i,
      /mulu/i,
    ]);
  }

  function projectNameFromDirectory(value) {
    const text = typeof value === "string" || typeof value === "number"
      ? String(value).replace(/^所在目录\s*[:：]?\s*/i, "").replace(/^目录\s*[:：]?\s*/i, "").trim()
      : "";
    if (!text) return "";
    const parts = text.split(/[\\/>＞]+/).map(cleanProjectName).filter(Boolean);
    return parts.find(isUsableProjectName) || "";
  }

  function firstProjectValue(source) {
    if (!source || typeof source !== "object") return "";
    const keys = ["projectName", "project", "folderName", "project_name", "projectname", "projectTitle", "prjName", "projName", "xmName", "xmmc", "itemName", "auditName", "name", "title"];
    for (const key of keys) {
      const value = cleanProjectName(source[key]);
      if (value) return value;
    }
    return "";
  }

  function firstDirectoryProjectValue(source) {
    if (!source || typeof source !== "object") return "";
    for (const [key, value] of Object.entries(source)) {
      if (!/(所在目录|目录|路径|path|folder|catalog|directory|dir|mulu|ml)/i.test(key)) continue;
      const projectName = projectNameFromDirectory(value);
      if (projectName) return projectName;
    }
    return "";
  }

  function collectProjectCandidates(targetWindow) {
    const candidates = [];
    try {
      candidates.push(firstDirectoryProjectValue(targetWindow));
      candidates.push(firstProjectValue(targetWindow));
      candidates.push(firstDirectoryProjectValue(targetWindow.globaltree && targetWindow.globaltree.treeNode));
      candidates.push(firstProjectValue(targetWindow.globaltree && targetWindow.globaltree.treeNode));
      candidates.push(firstDirectoryProjectValue(targetWindow.globaltree && targetWindow.globaltree.rootNode));
      candidates.push(firstProjectValue(targetWindow.globaltree && targetWindow.globaltree.rootNode));

      const rows = targetWindow.layui && targetWindow.layui.table && targetWindow.layui.table.cache && Array.isArray(targetWindow.layui.table.cache.table2)
        ? targetWindow.layui.table.cache.table2
        : [];
      for (const row of rows.slice(0, 20)) {
        candidates.push(projectNameFromDirectory(getRowDirectory(row)));
        candidates.push(firstDirectoryProjectValue(row));
        candidates.push(firstProjectValue(row));
      }

      const params = new URLSearchParams(targetWindow.location.search);
      for (const key of ["projectName", "project", "folderName", "xmmc", "xmName", "itemName"]) {
        candidates.push(cleanProjectName(params.get(key)));
      }
    } catch (_error) {
      // Ignore inaccessible frames/windows.
    }
    return candidates.filter(Boolean);
  }

  function getProjectName() {
    const candidates = [];
    for (const targetWindow of [window, window.parent, window.top]) {
      if (targetWindow && !candidates.includes(targetWindow)) {
        candidates.push(...collectProjectCandidates(targetWindow));
      }
    }
    return candidates.find((value) => isUsableProjectName(value) && !/^工作底稿内容管理软件/i.test(value)) || "";
  }

  function pickFileNameFromTexts(texts) {
    const candidates = texts
      .map(cleanFileName)
      .filter((text) => /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|txt|zip|rar|7z)$/i.test(text) && !isBadFileName(text));
    return candidates.sort((a, b) => b.length - a.length)[0] || "";
  }

  function getVisibleTableRows(checkedOnly) {
    const rows = [];
    const views = Array.from(document.querySelectorAll(".layui-table-view"));
    for (const view of views) {
      const headerByField = {};
      for (const headerCell of Array.from(view.querySelectorAll(".layui-table-header th[data-field]"))) {
        const field = headerCell.getAttribute("data-field") || "";
        const label = (headerCell.textContent || "").replace(/\s+/g, " ").trim();
        if (field && label) headerByField[field] = label;
      }

      const indexes = Array.from(new Set(
        Array.from(view.querySelectorAll(".layui-table-body tr[data-index]")).map((row) => row.getAttribute("data-index")).filter(Boolean)
      ));

      for (const index of indexes) {
        const rowParts = Array.from(view.querySelectorAll(`.layui-table-body tr[data-index="${index}"]`));
        const isChecked = rowParts.some((row) => row.querySelector("input[type='checkbox']:checked") || row.querySelector(".layui-form-checkbox.layui-form-checked"));
        if (checkedOnly && !isChecked) continue;

        const byField = {};
        const texts = [];
        for (const cell of rowParts.flatMap((row) => Array.from(row.querySelectorAll("td[data-field]")))) {
          const field = cell.getAttribute("data-field") || "";
          const text = (cell.textContent || "").replace(/\s+/g, " ").trim();
          if (!field || !text || field === "0") continue;
          byField[field] = text;
          texts.push(text);
        }

        let name = "";
        let directory = "";
        for (const [field, text] of Object.entries(byField)) {
          const label = headerByField[field] || field;
          if (!name && /(文件名|文档名|底稿名|资料名|file.?name|doc.?name|name)/i.test(label)) name = cleanFileName(text);
          if (!directory && /(所在目录|目录|路径|path|folder|directory)/i.test(label)) directory = text;
        }

        rows.push({
          index,
          name: !isBadFileName(name) ? name : pickFileNameFromTexts(texts),
          directory,
          texts,
        });
      }
    }
    return rows;
  }

  function getLayerTitles() {
    return Array.from(document.querySelectorAll(".layui-layer-title"))
      .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function fileNameFromAuditLogTitle(title) {
    const text = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
    if (!text || !text.includes("-")) return "";
    return cleanFileName(text.split("-").pop());
  }

  function findAuditLogTriggerForRow(rowIndex) {
    const rowParts = Array.from(document.querySelectorAll(`.layui-table-body tr[data-index="${rowIndex}"]`));
    for (const row of rowParts) {
      const triggers = Array.from(row.querySelectorAll("a,button,[lay-event],[onclick],[title]"));
      const trigger = triggers.find((element) => {
        const text = [element.textContent || "", element.getAttribute("title") || "", element.getAttribute("lay-event") || "", element.getAttribute("onclick") || ""].join(" ");
        return /审核日志|日志|audit|log/i.test(text);
      });
      if (trigger) return trigger;
    }
    return null;
  }

  async function getFileNameFromAuditLog(rowIndex) {
    const trigger = findAuditLogTriggerForRow(rowIndex);
    if (!trigger) return "";

    const beforeTitles = new Set(getLayerTitles());
    trigger.click();

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      const title = getLayerTitles().reverse().find((value) => !beforeTitles.has(value)) || "";
      const fileName = fileNameFromAuditLogTitle(title);
      if (fileName) {
        const closeButton = Array.from(document.querySelectorAll(".layui-layer-close")).pop();
        if (closeButton) closeButton.click();
        return fileName;
      }
    }

    const closeButton = Array.from(document.querySelectorAll(".layui-layer-close")).pop();
    if (closeButton) closeButton.click();
    return "";
  }

  async function enrichItemsWithAuditLogNames(items) {
    for (const item of items) {
      if (!item || (item.name && !isBadFileName(item.name))) continue;
      const fileName = await getFileNameFromAuditLog(item.rowIndex);
      if (fileName) {
        item.name = fileName;
        item.nameSource = "audit-log-title";
      }
    }
    return items;
  }

  async function getUploadItems() {
    const projectName = getProjectName();
    const visibleSelectedRows = getVisibleTableRows(true);
    const selectedItems = getSelectedRows().map((row, index) => {
      const visibleRow = visibleSelectedRows[index] || {};
      const id = getRowFileId(row);
      if (!id) return null;
      const visibleName = visibleRow.name || "";
      const cacheName = getRowFileName(row);
      return {
        id,
        kind: "file",
        name: !isBadFileName(visibleName) ? visibleName : cacheName,
        rowIndex: visibleRow.index,
        directory: visibleRow.directory || getRowDirectory(row),
        url: buildFileDownloadUrl([id]),
      };
    }).filter(Boolean);

    if (selectedItems.length > 0) {
      return {
        projectName: projectName || projectNameFromDirectory(selectedItems[0].directory),
        mode: "selected",
        items: await enrichItemsWithAuditLogNames(selectedItems),
      };
    }

    const visibleRows = getVisibleTableRows(false);
    const allItems = getTableRows().map((row, index) => {
      const visibleRow = visibleRows[index] || {};
      const id = getRowFileId(row);
      if (!id) return null;
      const visibleName = visibleRow.name || "";
      const cacheName = getRowFileName(row);
      return {
        id,
        kind: "file",
        name: !isBadFileName(visibleName) ? visibleName : cacheName,
        rowIndex: visibleRow.index,
        directory: visibleRow.directory || getRowDirectory(row),
        url: buildFileDownloadUrl([id]),
      };
    }).filter(Boolean);

    if (allItems.length > 0) {
      return {
        projectName: projectName || projectNameFromDirectory(allItems[0].directory),
        mode: "current-list",
        items: await enrichItemsWithAuditLogNames(allItems),
      };
    }

    const folderNodeId = getCurrentFolderNodeId();
    if (folderNodeId) {
      return {
        projectName,
        mode: "current-folder",
        items: [{ id: folderNodeId, kind: "folder", url: buildFolderDownloadUrl(folderNodeId) }],
      };
    }

    return { projectName, mode: "", items: [] };
  }

  function setUploadButtonState(label, isBusy) {
    const button = document.getElementById(UPLOAD_BUTTON_ID);
    if (!button) return;
    button.disabled = isBusy;
    button.textContent = label;
  }

  function setUploadButtonBusy(isBusy) {
    setUploadButtonState(isBusy ? "上传中..." : UPLOAD_LABEL, isBusy);
  }

  function postUploadRequest(payload) {
    const requestId = `upload-${Date.now()}-${uploadRequestSeq += 1}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("上传超时，请确认上传服务可以访问"));
      }, 30 * 60 * 1000);

      function onMessage(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const message = event.data;
        if (!message || message.source !== "paper-download-crx-content" || message.requestId !== requestId) return;

        if (message.type === "UPLOAD_PAPERS_PROGRESS") {
          const progress = message.progress || {};
          if (progress.label) setUploadButtonState(progress.label, true);
          return;
        }
        if (message.type !== "UPLOAD_PAPERS_RESULT") return;

        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (message.ok) resolve(message.result);
        else reject(new Error(message.error || "上传失败"));
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ source: "paper-download-crx-page", type: "UPLOAD_PAPERS", requestId, payload }, location.origin);
    });
  }

  function handleDownload(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const selectedFileIds = getSelectedFileIds();
    if (selectedFileIds.length > 0) {
      openFileDownload(selectedFileIds);
      return;
    }

    const allFileIds = getAllFileIds();
    if (allFileIds.length > 0) {
      openFileDownload(allFileIds);
      return;
    }

    const folderNodeId = getCurrentFolderNodeId();
    if (folderNodeId) {
      openFolderDownload(folderNodeId);
      return;
    }

    toast("请先选择文件或目录");
  }

  async function handleUpload(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const payload = await getUploadItems();
    if (!payload.items.length) {
      toast("请先选择文件或目录");
      return;
    }

    setUploadButtonBusy(true);
    try {
      const result = await postUploadRequest(payload);
      const count = result && typeof result.fileCount === "number" ? result.fileCount : payload.items.length;
      toast(`已上传 ${count} 个底稿到服务器`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadButtonBusy(false);
    }
  }

  function findAnchorButton() {
    const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"));
    return buttons.find((element) => (element.textContent || "").trim() === "下载" && element.id !== BUTTON_ID) || null;
  }

  function findToolbarContainer(anchor) {
    let node = anchor.parentElement;
    while (node && node !== document.body) {
      const rect = node.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.6) return node;
      node = node.parentElement;
    }
    return anchor.parentElement;
  }

  function styleHolder(holder, toolbar, anchor) {
    const toolbarRect = toolbar.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    holder.id = HOLDER_ID;
    holder.style.cssText = [
      "position:absolute",
      "right:15px",
      `top:${Math.max(0, anchorRect.top - toolbarRect.top)}px`,
      "display:inline-flex",
      "align-items:center",
      "height:30px",
      "z-index:999",
    ].join(";");
  }

  function styleButton(button, anchor) {
    button.className = anchor.className;
    const style = window.getComputedStyle(anchor);
    button.style.backgroundColor = style.backgroundColor;
    button.style.borderColor = style.borderColor;
    button.style.borderStyle = style.borderStyle;
    button.style.borderWidth = style.borderWidth;
    button.style.color = style.color;
    button.style.fontSize = style.fontSize;
    button.style.fontFamily = style.fontFamily;
    button.style.fontWeight = style.fontWeight;
    button.style.borderRadius = style.borderRadius;
    button.style.height = style.height;
    button.style.lineHeight = style.lineHeight;
    button.style.padding = style.padding;
    button.style.marginLeft = "0";
    button.style.whiteSpace = "nowrap";
    button.style.cursor = "pointer";
    button.style.minWidth = "72px";
  }

  function ensureButton() {
    if (document.getElementById(BUTTON_ID) && document.getElementById(UPLOAD_BUTTON_ID)) return;
    const anchor = findAnchorButton();
    if (!anchor || !anchor.parentElement) return;

    const toolbar = findToolbarContainer(anchor);
    if (window.getComputedStyle(toolbar).position === "static") toolbar.style.position = "relative";

    const holder = document.createElement("span");
    styleHolder(holder, toolbar, anchor);

    const downloadButton = document.createElement("button");
    downloadButton.id = BUTTON_ID;
    downloadButton.type = "button";
    downloadButton.textContent = DOWNLOAD_LABEL;
    downloadButton.title = "选中文件时下载文件；未选中文件时下载当前目录";
    styleButton(downloadButton, anchor);
    downloadButton.addEventListener("click", handleDownload);
    holder.appendChild(downloadButton);

    const uploadButton = document.createElement("button");
    uploadButton.id = UPLOAD_BUTTON_ID;
    uploadButton.type = "button";
    uploadButton.textContent = UPLOAD_LABEL;
    uploadButton.title = "选中文件时上传文件；未选中文件时上传当前目录";
    styleButton(uploadButton, anchor);
    uploadButton.style.marginLeft = "8px";
    uploadButton.addEventListener("click", handleUpload);
    holder.appendChild(uploadButton);

    toolbar.appendChild(holder);
  }

  const observer = new MutationObserver(() => ensureButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureButton();
})();
