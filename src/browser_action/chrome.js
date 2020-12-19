function hashCode(str) {
  let hash = 0;
  if (str.length == 0) {
    return '';
  }
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    // Convert to 32bit integer
    hash = hash & hash;
  }
  return hash.toString();
}

export function loadLocalMetrics(callback) {
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    const thisTab = tabs[0];

    // Retrieve the stored latest metrics
    if (thisTab.url) {
      const key = hashCode(thisTab.url);
      const loadedInBackgroundKey = thisTab.id.toString();

      let tabLoadedInBackground = false;

      chrome.storage.local.get(loadedInBackgroundKey, result => {
        tabLoadedInBackground = result[loadedInBackgroundKey];
      });

      chrome.storage.local.get(key, result => {
        if (result[key] !== undefined) {
          callback({
            metrics: result[key],
            background: tabLoadedInBackground
          });
        } else {
          callback({error: `Storage empty for key ${key}: ${result}`});
        }
      });
    }
  });
}
