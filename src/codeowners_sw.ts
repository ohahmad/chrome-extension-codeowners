chrome.webNavigation.onDOMContentLoaded.addListener(({ tabId, url }) => {
  if (!url.includes("merge_requests/")) return;

  void chrome.scripting.executeScript({
    target: { tabId },
    files: ["codeowners/codeowners.js"],
  });
});
