// When a tab is updated check to see if it is loaded and reset the icon UI
// let currentTab = 0;

// Hash the URL and return a numeric hash as a String to be used as the key
function hashCode(str) {
  let hash = 0;
  if (str.length == 0) {
    return "";
  }
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

function getWebVitals(tabId) {
  console.log(`background.js: getWebVitals() for tabId ${tabId}`);
  chrome.tabs.executeScript({
    file: "src/browser_action/core.js"
  }, result => {
    // Catch errors such as "This page cannot be scripted due to an ExtensionsSettings policy."
    const lastErr = chrome.runtime.lastError;
    if (lastErr) {
      console.log("Error: " + lastErr.message);
      chrome.browserAction.setIcon({
        path: "../../icons/default128w.png",
        tabId: tabId
      });
      // chrome.browserAction.setBadgeText({ text: "" });
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status == "complete" &&
    tab.url.startsWith("http") &&
    tab.active
  ) {
    console.log(`🍎 chrome.tabs.onUpdated ${tabId}`);
    //currentTab = tabId;
    getWebVitals(tabId);
  }
});

function updateBadgeColor(overall_category) {
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    let currentTab = tabs[0].id;
    switch (overall_category) {
      case 'POOR':
        chrome.browserAction.setBadgeBackgroundColor({
          color: "red",
          tabId: currentTab
        });
        break;
      case 'NI':
        chrome.browserAction.setBadgeBackgroundColor({
          color: "orange",
          tabId: currentTab
        });
        break;
      case 'GOOD':
        chrome.browserAction.setBadgeBackgroundColor({
          color: "green",
          tabId: currentTab
        });
        break;
      default:
        chrome.browserAction.setBadgeBackgroundColor({
          color: "white",
          tabId: currentTab
        });
        chrome.browserAction.setBadgeText({
          text: '',
          tabId: currentTab
        });
        break;
    }
  });
}

function updateBadgeIcon(overall_category) {
  console.log(`Updating badge icon to ${overall_category}`);
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    let currentTab = tabs[0].id;

    switch (overall_category) {
      case 'POOR':
        chrome.browserAction.setIcon({
          path: '../../icons/slow128w.png',
          tabId: currentTab
        });
        break;
      case 'GOOD':
        chrome.browserAction.setIcon({
          path: '../../icons/fast128w.png',
          tabId: currentTab
        });
        break;
      default:
        chrome.browserAction.setIcon({
          path: '../../icons/default128w.png',
          tabId: currentTab
        });
        break;
    }
  });
}

function passVitalsToPSI(badgeMetrics) {
//
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {          
  if (changeInfo.status == 'complete') {   
     chrome.tabs.query({active: true}, function(tabs) {
      chrome.runtime.sendMessage({
        metrics: badgeMetrics
      }, function (response) {
        console.log(`background.js: passed Web Vitals to the PSI content script`);
      });
     });
  }
});
//
  chrome.runtime.sendMessage({
    metrics: badgeMetrics
  }, function (response) {
    console.log(`background.js: passed Web Vitals to the PSI content script`);
  });

}

// message from content script
chrome.runtime.onMessage.addListener((request, sender, response) => {
  console.log(`background.js: update badge and pass metrics`);
  if (request.webVitalsScoreBucket !== undefined) {
    // e.g webVitalsScoreBucket === 'GOOD' => green badge
    updateBadgeIcon(request.webVitalsScoreBucket);
    // also pass the WebVitals metrics on to PSI for when 
    // the badge icon is clicked and the pop-up opens.
    passVitalsToPSI(request.metrics);

    // Store latest metrics locally only
    if (sender.tab.url) {
      let key = hashCode(sender.tab.url);
      chrome.storage.local.set({ [key]: request.metrics });
    }
    //
  }
});