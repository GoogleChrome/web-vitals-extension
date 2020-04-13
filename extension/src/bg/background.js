/*
 Copyright 2020 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
     http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
 *
 * Hash the URL and return a numeric hash as a String to be used as the key
 * @param {String} str
 * @returns
 */
function hashCode(str) {
  let hash = 0;
  if (str.length === 0) {
    return "";
  }
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

/**
 *
 * Call vitals.js to begin collecting local WebVitals metrics
 * @param {Number} tabId
 */
function getWebVitals(tabId) {
  console.log(`background.js: getWebVitals() for tabId ${tabId}`);
  chrome.tabs.executeScript({
    file: "src/browser_action/vitals.js"
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

// User has navigated to a new URL in a tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status == "complete" &&
    tab.url.startsWith("http") &&
    tab.active
  ) {
    getWebVitals(tabId);
  }
});

// User has made a new or existing tab visible
chrome.tabs.onActivated.addListener(({tabId, windowId}) => {
  getWebVitals(tabId);
});


/**
 *
 * Update the badge icon based on the overall WebVitals
 * pass rate (i.e good = green icon, poor = red icon)
 * @param {String} badgeCategory - GOOD or POOR
 * @param {Number} tabid
 */
function updateBadgeIcon(badgeCategory, tabid) {
  console.log(`Updating badge icon to ${badgeCategory}`);
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    let currentTab = tabid || tabs[0].id;

    switch (badgeCategory) {
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

/**
 *
 * Update the badge color based on the overall WebVitals
 * pass rate for metrics.
 * @param {String} badgeCategory
 */
function updateBadgeColor(badgeCategory) {
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    let currentTab = tabs[0].id;
    switch (badgeCategory) {
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

/**
 *
 * Broadcast collected WebVitals metrics for usage in the PSI popup
 * @param {Object} badgeMetrics
 */
function passVitalsToPSI(badgeMetrics) {
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
    updateBadgeIcon(request.webVitalsScoreBucket, sender.tab.id);
    // also pass the WebVitals metrics on to PSI for when
    // the badge icon is clicked and the pop-up opens.
    passVitalsToPSI(request.metrics);
    // Store latest metrics locally only
    if (sender.tab.url) {
      let key = hashCode(sender.tab.url);
      chrome.storage.local.set({ [key]: request.metrics });
    }
  }
});