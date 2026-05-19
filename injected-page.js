(() => {
  if (window.__paperDownloadCrxInjected) {
    return;
  }
  window.__paperDownloadCrxInjected = true;

  const BUTTON_ID = "paper-download-crx-download";
  const BUTTON_HOLDER_ID = "paper-download-crx-download-holder";
  const LABEL = "下载";

  function getCtx() {
    if (typeof ctx !== "undefined" && ctx) {
      return ctx;
    }
    return `${location.origin}/wpcms`;
  }

  function toast(message) {
    if (window.layer && typeof window.layer.msg === "function") {
      window.layer.msg(message);
      return;
    }
    window.alert(message);
  }

  function getSelectedFileIds() {
    const tableApi = window.layui && window.layui.table;
    if (!tableApi || typeof tableApi.checkStatus !== "function") {
      return [];
    }

    const checkStatus = tableApi.checkStatus("table2");
    const rows = Array.isArray(checkStatus?.data) ? checkStatus.data : [];
    return rows
      .map((row) => row && (row.alfrescoFileId || row.afrescoFileId)) // 兼容两种拼写
      .filter((value) => typeof value === "string" && value.trim());
  }

  function getCurrentFolderNodeId() {
    const treeNode = window.globaltree && window.globaltree.treeNode;
    if (!treeNode) {
      return "";
    }
    return treeNode.c_alfr_id || "";
  }

  function openFileDownload(ids) {
    const base = getCtx();
    if (ids.length > 200) {
      toast("最多只能下载200个文件");
      return;
    }

    const url =
      ids.length > 1
        ? `${base}/emvc/cms/upload/downloads.mvc?nodeIds=${encodeURIComponent(ids.join("^"))}`
        : `${base}/emvc/cms/upload/download.mvc?nodeId=${encodeURIComponent(ids[0])}`;

    window.location.href = url;
  }

  function openFolderDownload(nodeId) {
    const base = getCtx();
    window.location.href = `${base}/emvc/cms/upload/download.mvc?nodeId=${encodeURIComponent(nodeId)}`;
  }

  function getAllFileIds() {
    const tableApi = window.layui && window.layui.table;
    if (!tableApi || !tableApi.cache || !tableApi.cache["table2"]) {
      return [];
    }

    const rows = tableApi.cache["table2"];
    return rows
      .map((row) => row && (row.alfrescoFileId || row.afrescoFileId))
      .filter((value) => typeof value === "string" && value.trim());
  }

  function handleDownload(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const fileIds = getSelectedFileIds();
    if (fileIds.length > 0) {
      openFileDownload(fileIds);
      return;
    }

    // 如果没有勾选，尝试获取当前列表里所有的文件ID进行批量下载
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

  function findAnchorButton() {
    const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"));
    return buttons.find((el) => (el.textContent || "").trim() === "下载" && el.id !== BUTTON_ID) || null;
  }

  function findToolbarContainer(anchor) {
    let node = anchor.parentElement;
    while (node && node !== document.body) {
      const rect = node.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.6) {
        return node;
      }
      node = node.parentElement;
    }
    return anchor.parentElement;
  }

  function styleHolder(holder, toolbar, anchor) {
    const toolbarRect = toolbar.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const top = Math.max(0, anchorRect.top - toolbarRect.top);

    holder.id = BUTTON_HOLDER_ID;
    holder.style.cssText = [
      "position:absolute",
      "right:15px",
      `top:${top}px`,
      "display:inline-flex",
      "align-items:center",
      "height:30px",
      "z-index:999"
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
    if (document.getElementById(BUTTON_ID)) {
      return;
    }

    const anchor = findAnchorButton();
    if (!anchor || !anchor.parentElement) {
      return;
    }

    const toolbar = findToolbarContainer(anchor);
    
    // 确保绝对定位能相对于 toolbar
    if (window.getComputedStyle(toolbar).position === "static") {
      toolbar.style.position = "relative";
    }

    const holder = document.createElement("span");
    styleHolder(holder, toolbar, anchor);

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = LABEL;
    button.title = "选中文件时下载文件；未选中文件时下载当前目录";
    styleButton(button, anchor);
    button.addEventListener("click", handleDownload);
    holder.appendChild(button);

    toolbar.appendChild(holder);
  }

  const observer = new MutationObserver(() => {
    ensureButton();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  ensureButton();
})();
