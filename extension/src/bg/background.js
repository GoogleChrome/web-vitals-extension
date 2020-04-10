// When a tab is updated check to see if it is loaded and reset the icon UI
let currentTab = 0;

function getWebVitals(tabId) {
  // currentTab = tabId;
  chrome.tabs.executeScript(tabId, { file: "src/browser_action/core.js" }, result => {
    // Catch errors such as "This page cannot be scripted due to an ExtensionsSettings policy."
    const lastErr = chrome.runtime.lastError;
    if (lastErr) {
      console.log("Error: " + lastErr.message);
      chrome.browserAction.setIcon({ path: "../../icons/default128w.png", tabId: tabId });
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
      console.log(`chrome.tabs.onUpdated ${tabId}`);
      currentTab = tabId;
      getWebVitals(tabId);
    }
});

  function updateBadgeColor(overall_category) {
    // chrome.browserAction.setBadgeText({ text: overall_category, tabId: currentTab });
    // Adjust badging
    switch (overall_category) {
        case 'POOR':
            chrome.browserAction.setBadgeBackgroundColor({ color: "red", tabId: currentTab });
            break;
        case 'NI':
            chrome.browserAction.setBadgeBackgroundColor({ color: "orange", tabId: currentTab });
            break;
        case 'GOOD':
            chrome.browserAction.setBadgeBackgroundColor({ color: "green", tabId: currentTab });
            break;
        default:
            chrome.browserAction.setBadgeBackgroundColor({ color: "white", tabId: currentTab });
            chrome.browserAction.setBadgeText({ text: '', tabId: currentTab });
            break;
    }
}

function updateBadgeIcon(overall_category) {
  console.log(`Updating badge icon to ${overall_category}`);
    // Adjust badging
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
}

function passVitalsToPSI(badgeMetrics) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.runtime.sendMessage({metrics: badgeMetrics}, function(response) {
      console.log(`background.js: passed Web Vitals to the PSI content script ${tabs[0].id}`);
    });
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
  }
});