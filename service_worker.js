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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Get the optionsNoBadgeAnimation value
// Actual default is false but lets set to true initially in case sync storage
// is slow so users don't experience any animation initially.
let optionsNoBadgeAnimation = true;
chrome.storage.sync.get({
  noBadgeAnimation: false
}, ({noBadgeAnimation}) => {
  optionsNoBadgeAnimation = noBadgeAnimation;
});

/**
 * Hash the URL and return a numeric hash as a String to be used as the key
 * @param {String} str
 * @return {String} hash
 */
function hashCode(str) {
  let hash = 0;
  if (str.length === 0) {
    return '';
  }
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

function setExtensionErrorMessage(tab, errorMsg) {
  const key = hashCode(tab.url);
  chrome.storage.local.set({
    [key]: {
      type: 'error',
      message: errorMsg,
      timestamp: new Date().toISOString()
    }
  })
}

/**
 * Call vitals.js to begin collecting local WebVitals metrics.
 * This will cause the content script to emit an event that kicks off the badging flow.
 * @param {Number} tabId
 */
function getWebVitals(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['src/browser_action/vitals.js'],
  }, (result) => {
    // Catch errors such as "This page cannot be scripted due
    // to an ExtensionsSettings policy."
    const error = chrome.runtime.lastError;
    if (error && error.message) {
      console.log(error.message);
      chrome.tabs.get(tabId, (tab) => setExtensionErrorMessage(tab, error.message));
    }
  });
}

// User has navigated to a new URL in a tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const tabIdKey = tabId.toString();

  if (tab.active) {
    chrome.storage.local.set({[tabIdKey]: false});
  } else {
    chrome.storage.local.set({[tabIdKey]: true}); // tab was loaded in background
  }

  if (
    changeInfo.status == 'complete' &&
    tab.url.startsWith('http') &&
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
function badgeOverallPerf(badgeCategory, tabid) {
  chrome.tabs.query({
    active: true,
    currentWindow: true,
  }, function(tabs) {
    const currentTab = tabid || tabs[0].id;

    switch (badgeCategory) {
      case 'POOR':
        chrome.action.setIcon({
          path: '../../icons/slow128w.png',
          tabId: currentTab,
        });
        chrome.action.setBadgeText({
          text: '',
          tabId: currentTab,
        });
        break;
      case 'GOOD':
        chrome.action.setIcon({
          path: '../../icons/fast128w.png',
          tabId: currentTab,
        });
        break;
      default:
        chrome.action.setIcon({
          path: '../../icons/default128w.png',
          tabId: currentTab,
        });
        chrome.action.setBadgeText({
          text: '',
          tabId: currentTab,
        });
        break;
    }
  });
}

/**
 *
 * Badge the icon for a specific metric
 * @param {String} metric
 * @param {Number} value
 * @param {Number} tabid
 */
function badgeMetric(metric, value, rating, tabid) {
  chrome.tabs.query({
    active: true,
    currentWindow: true,
  }, function(tabs) {
    const currentTab = tabid || tabs[0].id;
    const bgColor = '#000';

    // If URL is overall failing the thresholds, only show
    // a red badge for metrics actually failing (issues/22)
    if (metric === 'lcp' && rating === 'good') {
      return;
    }
    if (metric === 'cls' && rating === 'good') {
      return;
    }
    if (metric === 'inp' && (rating === 'good' || rating === null)) {
      return;
    }

    switch (metric) {
      case 'lcp':
        chrome.action.setIcon({
          path: '../../icons/slow128w-lcp.png',
          tabId: currentTab,
        });
        chrome.action.setBadgeBackgroundColor({
          color: bgColor,
          tabId: currentTab,
        });
        chrome.action.setBadgeText({
          text: (value / 1000).toFixed(2),
          tabId: currentTab,
        });
        break;
      case 'cls':
        chrome.action.setIcon({
          path: '../../icons/slow128w-cls.png',
          tabId: currentTab,
        });
        chrome.action.setBadgeBackgroundColor({
          color: bgColor,
          tabId: currentTab,
        });
        chrome.action.setBadgeText({
          text: (value).toFixed(2),
          tabId: currentTab,
        });
        break;
      case 'inp':
        chrome.action.setIcon({
          path: '../../icons/slow128w-inp.png',
          tabId: currentTab,
        });
        chrome.action.setBadgeBackgroundColor({
          color: bgColor,
          tabId: currentTab,
        });
        chrome.action.setBadgeText({
          text: value.toFixed(0),
          tabId: currentTab,
        });
        break;
      default:
        chrome.action.setIcon({
          path: '../../icons/default128w.png',
          tabId: currentTab,
        });
        chrome.action.setBadgeBackgroundColor({
          color: '',
          tabId: currentTab,
        });
        chrome.action.setBadgeText({
          text: '',
          tabId: currentTab,
        });
        break;
    }
  });
}

/**
 * Wait ms milliseconds
 *
 * @param {Number} ms
 * @return {Promise}
 */
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {number} tabId
 * @return {Promise<boolean>}
 */
async function doesTabExist(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (_) {
    return false;
  }
}

/** @type {number} */
let globalAnimationId = 0;
/** @type {Map<number, number>} */
const animationsByTabId = new Map();


/**
 * Animate badges between pass/fail -> each failing metric.
 * We track each animation by tabId so that we can handle "cancellation" of the animation on new information.
 * @param {Object} request
 * @param {Number} tabId
 */
async function animateBadges(request, tabId) {
  const animationId = globalAnimationId;
  animationsByTabId.set(tabId, animationId);
  globalAnimationId++;

  const delay = 2000;
  // First badge overall perf
  badgeOverallPerf(request.passesAllThresholds, tabId);

  // If perf is poor, animate the sequence
  if (request.passesAllThresholds === 'POOR') {

    // However, if user has turned this off, then leave it off.
    // Note: if optionsNoBadgeAnimation is flipped, it won't start (or stop)
    // animating immediately until a status change or page reload to avoid
    // having to check continually. This is similar to HUD and console.logs
    // not appearing immediately.
    if (optionsNoBadgeAnimation) {
      return;
    }

    await wait(delay);
    if (animationsByTabId.get(tabId) !== animationId) return;
    badgeMetric('lcp', request.metrics.lcp.value, request.metrics.lcp.rating, tabId);

    await wait(delay);
    if (animationsByTabId.get(tabId) !== animationId) return;
    badgeMetric('inp', request.metrics.inp.value, request.metrics.inp.rating, tabId);

    await wait(delay);
    if (animationsByTabId.get(tabId) !== animationId) return;
    badgeMetric('cls', request.metrics.cls.value, request.metrics.cls.rating, tabId);

    // Loop the animation if no new information came in while we animated.
    await wait(delay);
    if (animationsByTabId.get(tabId) !== animationId) return;
    // Stop animating if the tab is gone
    if (!(await doesTabExist(tabId))) return;
    animateBadges(request, tabId);
  }
}

// message from content script
chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((request) => {
    if (request.passesAllThresholds !== undefined) {
      // e.g passesAllThresholds === 'GOOD' => green badge
      animateBadges(request, port.sender.tab.id);
      // Store latest metrics locally only.
      // The popup will load the metric values from this storage.
      if (port.sender.tab.url) {
        const key = hashCode(port.sender.tab.url);
        chrome.storage.local.set({[key]: request.metrics});
      }
      // send TabId to content script
      port.postMessage({tabId: port.sender.tab.id});
    }
  });
});

// Listen for changes to noBadgeAnimation option
function logStorageChange(changes, area) {
  if (area === 'sync' && 'noBadgeAnimation' in changes) {
    optionsNoBadgeAnimation = changes.noBadgeAnimation.newValue;
  }
}
chrome.storage.onChanged.addListener(logStorageChange);


async function clearOldCacheBackground(tabId) {
  if (!(await doesTabExist(tabId))) {
    chrome.storage.local.remove([tabId]);
  };
}

async function clearOldCache() {
  const now = Date.now();
  chrome.storage.local.get(null, results => {
    for (let hash in results) {
      if (results[hash].timestamp) {
        // If it's a timestamp, check if still valid
        const timestamp = new Date(results[hash].timestamp).getTime();
        if (now - timestamp > ONE_DAY_MS ) {
          console.log('Removing', hash, results[hash]);
          chrome.storage.local.remove([hash]);
        }
      } else if (typeof results[hash] === 'boolean') {
        // If it's a tab background status, clear that separately
        clearOldCacheBackground(hash);
      }
    }
  });

}

self.addEventListener('activate', _ => {
  clearOldCache();
});

