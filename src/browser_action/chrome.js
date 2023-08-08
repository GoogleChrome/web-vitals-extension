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

export function loadLocalMetrics() {
  return new Promise(resolve => {
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
            if (result[key].type && result[key].type === 'error') {
              // It's an error message, not a metrics object
              resolve({error: result[key].message});
            } else {
              resolve({
                metrics: result[key],
                background: tabLoadedInBackground
              });
            }
          } else {
            resolve({error: `Storage empty for key ${key}: ${result}`});
          }
        });
      }
    });
  });
}

export function getOptions() {
  return new Promise(resolve => {
    chrome.storage.sync.get({preferPhoneField: false}, resolve);
  });
}

export function getURL() {
  return new Promise(resolve => {
    chrome.tabs.query({active: true, lastFocusedWindow: true}, tabs => {
      let url = tabs[0].url;
      resolve(url);
    });
  });
}
