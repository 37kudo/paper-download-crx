const statusEl = document.getElementById("status");
const pingBtn = document.getElementById("pingBtn");
const saveBtn = document.getElementById("saveBtn");
const uploadEndpointEl = document.getElementById("uploadEndpoint");
const DEFAULT_UPLOAD_ENDPOINT = "http://127.0.0.1:8766/upload";

async function loadSettings() {
  const { uploadEndpoint } = await chrome.storage.local.get({
    uploadEndpoint: DEFAULT_UPLOAD_ENDPOINT,
  });
  uploadEndpointEl.value = uploadEndpoint || DEFAULT_UPLOAD_ENDPOINT;
}

saveBtn.addEventListener("click", async () => {
  const uploadEndpoint = uploadEndpointEl.value.trim() || DEFAULT_UPLOAD_ENDPOINT;
  await chrome.storage.local.set({ uploadEndpoint });
  statusEl.textContent = `已保存上传地址:\n${uploadEndpoint}`;
});

pingBtn.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "PING" });
  const { uploadEndpoint } = await chrome.storage.local.get({
    uploadEndpoint: DEFAULT_UPLOAD_ENDPOINT,
  });
  statusEl.textContent = [
    `扩展状态: ${response?.ok ? "正常" : "异常"}`,
    `名称: ${response?.name ?? "未知"}`,
    `上传地址: ${uploadEndpoint || DEFAULT_UPLOAD_ENDPOINT}`,
  ].join("\n");
});

loadSettings();
