export const getValueFromStorage = async (key: string): Promise<string> => {
  return new Promise(function (resolve, reject) {
    chrome.storage.local.get(key, function (items) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        resolve(items[key] as string);
      }
    });
  });
};
