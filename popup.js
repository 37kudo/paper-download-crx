const statusEl = document.getElementById("status");
const pingBtn = document.getElementById("pingBtn");
const queryEl = document.getElementById("query");

pingBtn.addEventListener("click", async () => {
  const query = queryEl.value.trim();
  const response = await chrome.runtime.sendMessage({ type: "PING" });
  statusEl.textContent = [
    `扩展状态: ${response?.ok ? "正常" : "异常"}`,
    `名称: ${response?.name ?? "未知"}`,
    query ? `输入内容: ${query}` : "输入内容: 空"
  ].join("\n");
});
