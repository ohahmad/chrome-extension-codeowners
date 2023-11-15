const codeOwnersRemoveInput: HTMLInputElement | null = document.querySelector(
  'input[name="codeowners-remove"]'
);

if (codeOwnersRemoveInput) {
  // update UI on startup
  chrome.storage.local.get('codeOwnersRemove', (result) => {
    const value = result.codeOwnersRemove as string | undefined;
    codeOwnersRemoveInput.value = value ?? '';
  });

  // update storage when UI changes
  codeOwnersRemoveInput.addEventListener('change', () => {
    void chrome.storage.local.set({
      codeOwnersRemove: codeOwnersRemoveInput.value
    });
  });

  // update UI when storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.codeOwnersRemove) {
      codeOwnersRemoveInput.value = changes.codeOwnersRemove.newValue as string;
    }
  });
}
