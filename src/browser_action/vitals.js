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
  const src = chrome.runtime.getURL('src/browser_action/web-vitals.js');
  const webVitals = await import(src);
  const { onEachInteraction } = await import(chrome.runtime.getURL('src/browser_action/on-each-interaction.js'));
  let overlayClosedForSession = false;
  let latestCLS = {};
  let enableLogging = localStorage.getItem('web-vitals-extension-debug')=='TRUE';
  let enableUserTiming = localStorage.getItem('web-vitals-extension-user-timing')=='TRUE';
  let tabLoadedInBackground;

  // Core Web Vitals thresholds
  const LCP_THRESHOLD = webVitals.LCPThresholds[0];
  const FID_THRESHOLD = webVitals.FIDThresholds[0];
  const INP_THRESHOLD = webVitals.INPThresholds[0];
  const CLS_THRESHOLD = webVitals.CLSThresholds[0];
  const FCP_THRESHOLD = webVitals.FCPThresholds[0];
  const TTFB_THRESHOLD = webVitals.TTFBThresholds[0];
  const COLOR_GOOD = '#0CCE6A';
  const COLOR_NEEDS_IMPROVEMENT = '#FFA400';
  const COLOR_POOR = '#FF4E42';
  const RATING_COLORS = {
    'good': COLOR_GOOD,
    'needs-improvement': COLOR_NEEDS_IMPROVEMENT,
    'poor': COLOR_POOR
  };

  // CLS update frequency
  const DEBOUNCE_DELAY = 500;

  // Default units of precision for HUD
  const DEFAULT_UNITS_OF_PRECISION = 3;

  // Identifiable prefix for console logging
  const LOG_PREFIX = '[Web Vitals Extension]';

  // Registry for badge metrics
  const badgeMetrics = initializeMetrics();

  // Set up extension message port with the service worker
  let port = chrome.runtime.connect();

  // Re-establish the port connection on bfcache restore
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      // The page is restored from BFCache, set up a new connection.
      port = chrome.runtime.connect();
    }
  });

  function toLocaleFixed({value, unit, precision }) {
    return value.toLocaleString(undefined, {
      style: unit && 'unit',
      unit,
      unitDisplay: 'short',
      minimumFractionDigits: precision ?? DEFAULT_UNITS_OF_PRECISION,
      maximumFractionDigits: precision ?? DEFAULT_UNITS_OF_PRECISION
    });
  }

  function initializeMetrics() {
    let metricsState = localStorage.getItem('web-vitals-extension-metrics');
    if (metricsState) {
      metricsState = JSON.parse(metricsState);

      if (metricsState.navigationStart == performance.timing.navigationStart) {
        return metricsState;
      }
    }

    // Create a fresh state.
    // Default all metric values to null.
    return {
      lcp: {
        value: null,
        pass: true,
      },
      cls: {
        value: null,
        pass: true,
      },
      fid: {
        value: null,
        pass: true,
      },
      inp: {
        value: null,
        pass: true,
      },
      fcp: {
        value: null,
        pass: true,
      },
      ttfb: {
        value: null,
        pass: true,
      },
      // This is used to distinguish between navigations.
      // TODO: Is there a cleaner way?
      navigationStart: performance.timing.navigationStart
    };

  }

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
    if (metrics.cls.value > CLS_THRESHOLD) {
      overallScore = 'POOR';
      metrics.cls.pass = false;
    }
    if (metrics.inp.value > INP_THRESHOLD) {
      overallScore = 'POOR';
      metrics.inp.pass = false;
    }
    if (metrics.fid.value > FID_THRESHOLD) {
      // FID does not affect overall score
      metrics.fid.pass = false;
    }
    if (metrics.fcp.value > FCP_THRESHOLD) {
      // FCP does not affect overall score
      metrics.fcp.pass = false;
    }
    if (metrics.ttfb.value > TTFB_THRESHOLD) {
      // TTFB does not affect overall score
      metrics.ttfb.pass = false;
    }
    return overallScore;
  }

  /**
     *
     * Draw or update the HUD overlay to the page
     * @param {Object} metrics
     * @param {Number} tabId
     */
  function drawOverlay(metrics) {

    localStorage.setItem('web-vitals-extension-metrics', JSON.stringify(metrics));

    // Check for preferences set in options
    chrome.storage.sync.get({
      enableOverlay: false,
      debug: false,
      userTiming: false
    }, ({
      enableOverlay, debug, userTiming
    }) => {
      if (enableOverlay === true && overlayClosedForSession == false) {
        let overlayElement = document.getElementById('web-vitals-extension-overlay');
        if (overlayElement === null) {
          // Overlay
          overlayElement = document.createElement('div');
          overlayElement.id = 'web-vitals-extension-overlay';
          overlayElement.classList.add('web-vitals-chrome-extension');
          document.body.appendChild(overlayElement);

          // Overlay close button
          overlayClose = document.createElement('button');
          overlayClose.innerText = 'Close';
          overlayClose.id = 'web-vitals-close';
          overlayClose.className = 'lh-overlay-close';
          overlayClose.addEventListener('click', () => {
            overlayElement.remove();
            overlayClose.remove();
            overlayClosedForSession = true;
          });

          document.body.appendChild(overlayClose);
        }

        overlayElement.innerHTML = buildOverlayTemplate(metrics);
      }

      if (debug) {
        localStorage.setItem('web-vitals-extension-debug', 'TRUE');
        enableLogging = true;
      } else {
        localStorage.removeItem('web-vitals-extension-debug');
        enableLogging = false;
      }
      if (userTiming) {
        localStorage.setItem('web-vitals-extension-user-timing', 'TRUE');
        enableUserTiming = true;
      } else {
        localStorage.removeItem('web-vitals-extension-user-timing');
        enableUserTiming = false;
      }
    });
  }

  /**
     *
     * Broadcasts metrics updates using postMessage, triggering
     * updates to the badge, overlay and logs as appropriate
     * @param {Object} metric
     */
  function broadcastMetricsUpdates(metric) {
    if (badgeMetrics === undefined) {
      return;
    }
    if (enableUserTiming) {
      addUserTimings(metric);
    }
    badgeMetrics[metric.name.toLowerCase()].value = metric.value;
    badgeMetrics.timestamp = new Date().toISOString();
    const passes = scoreBadgeMetrics(badgeMetrics);

    // Broadcast metrics updates for badging
    try {
      port.postMessage({
        passesAllThresholds: passes,
        metrics: badgeMetrics,
      });
    } catch (_) {
      // Do nothing on error, which can happen on tab switches
    }

    drawOverlay(badgeMetrics);

    if (enableLogging) {
      logSummaryInfo(metric);
    }
  }

  // Listed to the message response containing the tab id
  // to set the tabLoadedInBackground.
  port.onMessage.addListener((response) => {
    if (response.tabId === undefined) {
      return;
    }

    // Only set the tabLoadedInBackground if not already set
    if (tabLoadedInBackground === undefined) {
      const key = response.tabId.toString();
      chrome.storage.local.get(key, result => {
        tabLoadedInBackground = result[key];
      });
    }
  });

  async function logSummaryInfo(metric) {
    const formattedValue = metric.name === 'CLS' ? metric.value.toFixed(2) : `${metric.value.toFixed(0)} ms`;
    console.groupCollapsed(
      `${LOG_PREFIX} ${metric.name} %c${formattedValue} (${metric.rating})`,
      `color: ${RATING_COLORS[metric.rating] || 'inherit'}`
    );

    if (metric.name == 'LCP' &&
        metric.attribution &&
        metric.attribution.lcpEntry &&
        metric.attribution.navigationEntry) {
      if (tabLoadedInBackground) {
        console.warn('LCP inflated by tab loading in the background');
      }
      console.log('LCP element:', metric.attribution.lcpEntry.element);
      console.table([{
        'LCP sub-part': 'Time to First Byte',
        'Time (ms)': Math.round(metric.attribution.timeToFirstByte, 0),
      }, {
        'LCP sub-part': 'Resource load delay',
        'Time (ms)': Math.round(metric.attribution.resourceLoadDelay, 0),
      }, {
        'LCP sub-part': 'Resource load duration',
        'Time (ms)': Math.round(metric.attribution.resourceLoadDuration, 0),
      }, {
        'LCP sub-part': 'Element render delay',
        'Time (ms)': Math.round(metric.attribution.elementRenderDelay, 0),
      }]);
    }

    else if (metric.name == 'FCP' &&
        metric.attribution &&
        metric.attribution.fcpEntry &&
        metric.attribution.navigationEntry) {
      if (tabLoadedInBackground) {
        console.warn('FCP inflated by tab loading in the background');
      }
      console.log('FCP loadState:', metric.attribution.loadState);
      console.table([{
        'FCP sub-part': 'Time to First Byte',
        'Time (ms)': Math.round(metric.attribution.timeToFirstByte, 0),
      }, {
        'FCP sub-part': 'FCP render delay',
        'Time (ms)': Math.round(metric.attribution.firstByteToFCP, 0),
      }]);
    }

    else if (metric.name == 'CLS' && metric.entries.length) {
      for (const entry of metric.entries) {
        console.log('Layout shift - score: ', Math.round(entry.value * 10000) / 10000);
        for (const source of entry.sources) {
          console.log(source.node);
        }
      };
    }

    else if ((metric.name == 'INP' ||  metric.name == 'Interaction') &&
        metric.attribution) {
      const subPartString = `${metric.name} sub-part`;
      const interactionEntry = metric.attribution.interactionEntry;

      let eventTarget = metric.entries[0].target;
      // Sometimes the interactionEntry has no target, so we need to hunt it out manually.
      // As of web-vitals@3.5.2 `attribution.eventTarget` does the same thing,
      // but we want a reference to the element itself (for logging), not a selector.
      if (!eventTarget) {
        eventTarget = metric.entries.find(entry => entry.target)?.target;
      }
      console.log('Interaction target:', eventTarget);
      console.log(`Interaction event type: %c${metric.attribution.interactionType}`, 'font-family: monospace');

      console.table([{
        'Interaction sub-part': 'Input delay',
        'Time (ms)': Math.round(metric.attribution.inputDelay, 0),
      },
      {
        'Interaction sub-part': 'Processing duration',
        'Time (ms)': Math.round(metric.attribution.processingDuration, 0),
      },
      {
        'Interaction sub-part': 'Presentation delay',
        'Time (ms)': Math.round(metric.attribution.presentationDelay, 0),
      }]);

      if (metric.attribution.longAnimationFrameEntries) {

        const allScripts = metric.attribution.longAnimationFrameEntries.map(a => a.scripts).flat();
        const sortedScripts = allScripts.sort((a,b) => b.duration - a.duration);

        scriptData = sortedScripts.map((a) => (
              {
                'Script duration': Math.round(a.duration, 0),
                'Script type': a.invokerType,
                'Script function': a.sourceFunctionName,
                'Script source': a.sourceURL || a.invoker,
                'Script char position': a.sourceCharPosition,
              }
        ))

        if (scriptData.length > 0) {
          console.log("Long scripts:");
          console.table(scriptData);
        }
      }
    }

    else if (metric.name == 'FID') {
      const eventEntry = metric.attribution.eventEntry;
      console.log('Interaction target:', eventEntry.target);
      console.log(`Interaction type: %c${eventEntry.name}`, 'font-family: monospace');
    }

    else if (metric.name == 'TTFB' &&
        metric.attribution &&
        metric.attribution.navigationEntry) {
      console.log('TTFB navigation type:', metric.navigationType);
      console.table([{
        'TTFB sub-part': 'Waiting duration',
        'Time (ms)': Math.round(metric.attribution.waitingDuration, 0),
      }, {
        'TTFB sub-part': 'Cache duration',
        'Time (ms)': Math.round(metric.attribution.cacheDuration, 0),
      }, {
        'TTFB sub-part': 'DNS duration',
        'Time (ms)': Math.round(metric.attribution.dnsDuration, 0),
      }, {
        'TTFB sub-part': 'Connection duration',
        'Time (ms)': Math.round(metric.attribution.connectionDuration, 0),
      }, {
        'TTFB sub-part': 'Request duration',
        'Time (ms)': Math.round(metric.attribution.requestDuration, 0),
      }]);
    }

    console.log(metric);
    console.groupEnd();
  }

  function addUserTimings(metric) {
    switch (metric.name) {
      case "LCP":
        if (!(metric.attribution && metric.attribution.lcpEntry && metric.attribution.navigationEntry)) {
          break;
        }

        const navEntry = metric.attribution.navigationEntry;
        // Set the start time to the later of the actual start time or the activationStart (for prerender) or 0
        const startTime = Math.max(navEntry.startTime, navEntry.activationStart) || 0;
        // Add the performance marks for the Performance Panel
        performance.measure(`${LOG_PREFIX} LCP.timeToFirstByte`, {
          start: startTime,
          duration: metric.attribution.timeToFirstByte,
        });
        performance.measure(`${LOG_PREFIX} LCP.resourceLoadDelay`, {
          start: startTime + metric.attribution.timeToFirstByte,
          duration: metric.attribution.resourceLoadDelay,
        });
        performance.measure(`${LOG_PREFIX} LCP.resourceLoadDuration`, {
          start:
            startTime +
            metric.attribution.timeToFirstByte +
            metric.attribution.resourceLoadDelay,
          duration: metric.attribution.resourceLoadDuration,
        });
        performance.measure(`${LOG_PREFIX} LCP.elementRenderDelay`, {
          duration: metric.attribution.elementRenderDelay,
          end: metric.value
        });
        break;

      case "INP":
        if (!(metric.attribution)) {
          break;
        }

        const attribution = metric.attribution;
        const interactionTime = attribution.interactionTime;
        const inputDelay = attribution.inputDelay;
        const processingDuration = attribution.processingDuration;
        const presentationDelay = attribution.presentationDelay;

        performance.measure(`${LOG_PREFIX} INP.inputDelay (${metric.attribution.interactionType})`, {
          start: interactionTime,
          end: interactionTime + inputDelay,
        });
        performance.measure(`${LOG_PREFIX} INP.processingTime (${metric.attribution.interactionType})`, {
          start: interactionTime + inputDelay,
          end: interactionTime + inputDelay + processingDuration,
        });
        performance.measure(`${LOG_PREFIX} INP.presentationDelay (${metric.attribution.interactionType})`, {
          start: interactionTime + inputDelay + processingDuration,
          end: interactionTime + inputDelay + processingDuration + presentationDelay,
        });
        break;

      case "FID":
        if (!(metric.attribution && metric.attribution.interactionEntry)) {
          break;
        }

        const fidEntry = metric.attribution.interactionEntry;
        performance.measure(`${LOG_PREFIX} FID (${fidEntry.name})`, {
          start: fidEntry.startTime,
          end: fidEntry.processingStart,
        });
    }
  }

  /**
   * Broadcasts the latest CLS value
   */
  function broadcastCLS() {
    broadcastMetricsUpdates(latestCLS);
  }

  /**
 * Debounces the broadcast of CLS values for stability.
 * broadcastCLS is invoked on the trailing edge of the
 * DEBOUNCE_DELAY timeout if invoked more than once during
 * the wait timeout.
 */
  let debouncedCLSBroadcast = () => {};
  if (typeof _ !== 'undefined') {
    debouncedCLSBroadcast = _.debounce(broadcastCLS, DEBOUNCE_DELAY, {
      leading: true,
      trailing: true,
      maxWait: 1000});
  }
  /**
 *
 * Fetches Web Vitals metrics via WebVitals.js
 */
  function fetchWebPerfMetrics() {
    // web-vitals.js doesn't have a way to remove previous listeners, so we'll save whether
    // we've already installed the listeners before installing them again.
    // See https://github.com/GoogleChrome/web-vitals/issues/55.
    if (self._hasInstalledPerfMetrics) return;
    self._hasInstalledPerfMetrics = true;

    webVitals.onCLS((metric) => {
      // As CLS values can fire frequently in the case
      // of animations or highly-dynamic content, we
      // debounce the broadcast of the metric.
      latestCLS = metric;
      debouncedCLSBroadcast();
    }, { reportAllChanges: true });

    webVitals.onLCP(broadcastMetricsUpdates, { reportAllChanges: true });
    webVitals.onFID(broadcastMetricsUpdates, { reportAllChanges: true });
    webVitals.onINP((metric) => {
      broadcastMetricsUpdates(metric)
    }, { reportAllChanges: true });
    webVitals.onFCP(broadcastMetricsUpdates, { reportAllChanges: true });
    webVitals.onTTFB(broadcastMetricsUpdates, { reportAllChanges: true });

    if (enableLogging) {
      onEachInteraction((metric) => {
        logSummaryInfo(metric, false);
      });
    }
  }

  /**
 * Build a template of metrics
 * @param {Object} metrics The metrics
 * @return {String} a populated template of metrics
 */
  function buildOverlayTemplate(metrics) {
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
              <span class="lh-metric__title">Largest Contentful Paint</span>
              ${tabLoadedInBackground ? '<span class="lh-metric__subtitle">Value inflated as tab was loaded in background</span>' : ''}
            </div>
            <div class="lh-metric__value">${toLocaleFixed({value: (metrics.lcp.value || 0)/1000, unit: 'second'})}</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.cls.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">Cumulative Layout Shift</span>
            <div class="lh-metric__value">${toLocaleFixed({value: metrics.cls.value || 0, precision: 2})}</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.inp.pass ? 'pass':'fail'} lh-metric--${metrics.inp.value === null ? 'waiting' : 'ready'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">
              Interaction to Next Paint
              <span class="lh-metric-state">${metrics.inp.value === null ? '(waiting for input)' : ''}</span>
            </span>
            <div class="lh-metric__value">${
              metrics.inp.value === null ? '' :
              `${toLocaleFixed({value: metrics.inp.value, unit: 'millisecond', precision: 0})}`
            }</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.fid.pass ? 'pass':'fail'} lh-metric--${metrics.fid.value === null ? 'waiting' : 'ready'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">
              First Input Delay
              <span class="lh-metric-state">${metrics.fid.value === null ? '(waiting for input)' : ''}</span>
            </span>
            <div class="lh-metric__value">${
              metrics.fid.value === null ? '' :
              `${toLocaleFixed({value: metrics.fid.value, unit: 'millisecond', precision: 0})}`
            }</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.fcp.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <div>
              <span class="lh-metric__title">First Contentful Paint</span>
              ${tabLoadedInBackground ? '<span class="lh-metric__subtitle">Value inflated as tab was loaded in background</span>' : ''}
            </div>
            <div class="lh-metric__value">${toLocaleFixed({value: (metrics.fcp.value || 0)/1000, unit: 'second'})}</div>
          </div>
        </div>
        <div class="lh-column">
          <div class="lh-metric lh-metric--${metrics.ttfb.pass ? 'pass':'fail'}">
            <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">
              Time to First Byte
            </span>
            <div class="lh-metric__value">${toLocaleFixed({value: (metrics.ttfb.value || 0)/1000, unit: 'second'})}</div>
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
