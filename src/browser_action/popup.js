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

import { LCP, FID, CLS } from './metric.js';

class Popup {

  constructor({metrics, background}) {
    console.log('Popup', metrics, background)

    const {location, timestamp, ..._metrics} = metrics;

    this.location = location;
    this.timestamp = timestamp;
    this.metrics = _metrics;
    this.background = background;

    this.init();
  }

  init() {
    this.initPage();
    this.initTimestamp();
    this.initMetrics();
  }

  initPage() {
    const page = document.getElementById('page');
    page.innerText = this.location.url;
    page.title = this.location.url;
  }

  initTimestamp() {
    const timestamp = document.getElementById('timestamp');
    timestamp.innerText = this.timestamp;
  }

  initMetrics() {
    const lcp = new LCP({
      local: this.metrics.lcp.value,
      finalized: this.metrics.lcp.final
    });
    const fid = new FID({
      local: this.metrics.fid.value,
      finalized: this.metrics.fid.final
    });
    const cls = new CLS({
      local: this.metrics.cls.value,
      finalized: this.metrics.cls.final
    });
  }

}

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
        new Popup({
          metrics: result[key],
          background: tabLoadedInBackground
        });
      } else {
        console.warn('undefined result', key)
      }
    });
  }
});