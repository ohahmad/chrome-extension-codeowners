chrome.webNavigation.onDOMContentLoaded.addListener(async ({ tabId, url }) => {
    if (!url.includes('merge_requests/')) return;
  
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['codeowners.js']
    });
  });