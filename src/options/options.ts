const codeOwnersRemoveInput = document.querySelector(
  'input[name="codeowners-remove"]'
) as HTMLInputElement;

// update UI on startup
chrome.storage.local.get("codeOwnersRemove", (result) => {
  const value = result.codeOwnersRemove;
  codeOwnersRemoveInput.value = value ?? "";
});

// update storage when UI changes
codeOwnersRemoveInput.addEventListener("change", () => {
  chrome.storage.local.set({
    codeOwnersRemove: codeOwnersRemoveInput.value,
  });
});

// update UI when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.codeOwnersRemove) {
    codeOwnersRemoveInput.value = changes.codeOwnersRemove.newValue;
  }
});
