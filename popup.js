const statusEl = document.getElementById("status");
const pingBtn = document.getElementById("pingBtn");
const saveBtn = document.getElementById("saveBtn");
const uploadEndpointEl = document.getElementById("uploadEndpoint");
const LEGACY_UPLOAD_ENDPOINT = "http://127.0.0.1:8766/upload";
const DEFAULT_UPLOAD_ENDPOINT = "http://140.245.38.221:8766/upload";

async function loadSettings() {
  const { uploadEndpoint } = await chrome.storage.local.get({
    uploadEndpoint: DEFAULT_UPLOAD_ENDPOINT,
  });
  uploadEndpointEl.value = uploadEndpoint === LEGACY_UPLOAD_ENDPOINT
    ? DEFAULT_UPLOAD_ENDPOINT
    : uploadEndpoint || DEFAULT_UPLOAD_ENDPOINT;
}

saveBtn.addEventListener("click", async () => {
  const uploadEndpoint = uploadEndpointEl.value.trim() || DEFAULT_UPLOAD_ENDPOINT;
  await chrome.storage.local.set({ uploadEndpoint });
  statusEl.textContent = `宸蹭繚瀛樹笂浼犲湴鍧€:\n${uploadEndpoint}`;
});

pingBtn.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "PING" });
  const { uploadEndpoint } = await chrome.storage.local.get({
    uploadEndpoint: DEFAULT_UPLOAD_ENDPOINT,
  });
  statusEl.textContent = [
    `鎵╁睍鐘舵€? ${response?.ok ? "姝ｅ父" : "寮傚父"}`,
    `鍚嶇О: ${response?.name ?? "鏈煡"}`,
    `涓婁紶鍦板潃: ${uploadEndpoint || DEFAULT_UPLOAD_ENDPOINT}`,
  ].join("\n");
});

loadSettings();
