chrome.runtime.onInstalled.addListener(() => {
  console.log("paper-download-crx installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true, name: "paper-download-crx" });
  }
});
