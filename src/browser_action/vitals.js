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

(async () => {
  const src = chrome.runtime.getURL('node_modules/web-vitals/dist/web-vitals.min.js');
  const webVitals = await import(src);
  let overlayClosedForSession = false;

  // Core Web Vitals thresholds
  const LCP_THRESHOLD = 2500;
  const FID_THRESHOLD = 100;
  const CLS_THRESHOLD = 0.1;

  // Registry for badge metrics
  badgeMetrics = {
    lcp: {
      value: 0,
      final: false,
      pass: true,
    },
    cls: {
      value: 0,
      final: false,
      pass: true,
    },
    fid: {
      value: 0,
      final: false,
      pass: true,
    },
  };

  /**
    * Very simple classifier for metrics values
    * @param  {Object} metrics
    * @return {String} overall metrics score
  */
  function scoreBadgeMetrics(metrics) {
    // Note: overallScore is treated as a string rather than
    // a boolean to give us the flexibility of introducing a
    // 'NEEDS IMPROVEMENT' option here in the future.
    let overallScore = 'GOOD';
    if (metrics.lcp.value > LCP_THRESHOLD) {
      overallScore = 'POOR';
      metrics.lcp.pass = false;
    }
    if (metrics.fid.value > FID_THRESHOLD) {
      overallScore = 'POOR';
      metrics.fid.pass = false;
    }
    if (metrics.cls.value > CLS_THRESHOLD) {
      overallScore = 'POOR';
      metrics.cls.pass = false;
    }
    return overallScore;
  }

  /**
     *
     * Draw or update the HUD overlay to the page
     * @param {Object} metrics
     * @param {Number} tabId
     */
  function drawOverlay(metrics, tabId) {
    let tabLoadedInBackground = false;
    const key = tabId.toString()

    // Check if tab was loaded in background
    chrome.storage.local.get(key, (result) => {
      tabLoadedInBackground = result[key];
    });

    // Check for preferences set in options
    chrome.storage.sync.get({
      enableOverlay: false,
    }, ({
      enableOverlay,
    }) => {
      if (enableOverlay === true && overlayClosedForSession == false) {
        // Overlay
        const overlayElement = document.getElementById('web-vitals-extension');
        if (overlayElement === null) {
          const overlayElement = document.createElement('div');
          overlayElement.id = 'web-vitals-extension';
          overlayElement.innerHTML = buildOverlayTemplate(metrics, tabLoadedInBackground);
          document.body.appendChild(overlayElement);
        } else {
          overlayElement.innerHTML = buildOverlayTemplate(metrics, tabLoadedInBackground);
        }

        // Overlay close button
        const overlayClose = document.getElementById('web-vitals-close');
        if (overlayClose === null) {
          const overlayClose = document.createElement('button');
          overlayClose.innerText = 'Close';
          overlayClose.id = 'web-vitals-close';
          overlayClose.className = 'lh-overlay-close';
          overlayClose.addEventListener('click', () => {
            overlayElement.remove();
            overlayClose.remove();
            overlayClosedForSession = true;
          });
          document.body.appendChild(overlayClose);
        } else {
          overlayClose.addEventListener('click', () => {
            overlayElement.remove();
            overlayClose.remove();
            overlayClosedForSession = true;
          });
        }
      }
    });
  }


  /**
     *
     * Broadcasts metrics updates using chrome.runtime(), triggering
     * updates to the badge. Will also update the overlay if this option
     * is enabled.
     * @param {String} metricName
     * @param {Object} body
     */
  function broadcastMetricsUpdates(metricName, body) {
    if (metricName === undefined) {
      return;
    }
    badgeMetrics[metricName].value = body.value;
    badgeMetrics[metricName].final = body.isFinal;
    const passes = scoreBadgeMetrics(badgeMetrics);
    // Broadcast metrics updates for badging
    chrome.runtime.sendMessage(
      {
        passesAllThresholds: passes,
        metrics: badgeMetrics,
      },
      (response) => drawOverlay(badgeMetrics, response.tabId) // TODO: Once the metrics are final, cache locally.
    );
  }

  /**
 *
 * Fetches Web Vitals metrics via WebVitals.js
 */
  function fetchWebPerfMetrics() {
    webVitals.getCLS((metric) => {
      broadcastMetricsUpdates('cls', metric);
    }, true);
    webVitals.getLCP((metric) => {
      broadcastMetricsUpdates('lcp', metric);
    }, true);
    webVitals.getFID((metric) => {
      broadcastMetricsUpdates('fid', metric);
    }, true);
  }

  /**
 * Build a template of metrics
 * @param {Object} metrics The metrics
 * @param {Boolean} tabLoadedInBackground
 * @return {String} a populated template of metrics
 */
  function buildOverlayTemplate(metrics, tabLoadedInBackground) {
    return `
    <div id="lh-overlay-container" class="lh-unset lh-root lh-vars dark" style="display: block;">
    <div class="lh-overlay">
    <div class="lh-audit-group lh-audit-group--metrics">
    <div class="lh-audit-group__header">
      <span class="lh-audit-group__title">Metrics</span>
    </div>
    <div class="lh-columns">
      <div class="lh-column">
        <div class="lh-metric lh-metric--${metrics.lcp.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <div>
              <span class="lh-metric__title">
                Largest Contentful Paint 
                  <span class="lh-metric-state">${metrics.lcp.final ? '(final)' : '(not final)'}</span></span>
                  ${tabLoadedInBackground ? '<span class="lh-metric__subtitle">Value inflated as tab was loaded in background</span>' : ''}
            </div>
            <div class="lh-metric__value">${(metrics.lcp.value/1000).toFixed(2)}&nbsp;s</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.fid.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">
              First Input Delay 
                <span class="lh-metric-state">${metrics.fid.final ? '(final)' : '(not final)'}</span></span>
            <div class="lh-metric__value">${metrics.fid.value.toFixed(2)}&nbsp;ms</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.cls.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">
              Cumulative Layout Shift 
                <span class="lh-metric-state">${metrics.cls.final ? '(final)' : '(not final)'}</span></span>
            <div class="lh-metric__value">${metrics.cls.value.toFixed(3)}&nbsp;</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
  </div>`;
  }

  fetchWebPerfMetrics();
})();
