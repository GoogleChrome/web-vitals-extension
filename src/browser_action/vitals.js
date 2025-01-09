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

  const secondsFormatter = new Intl.NumberFormat(undefined, {
    unit: "second",
    style: 'unit',
    unitDisplay: "short",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });

  const millisecondsFormatter = new Intl.NumberFormat(undefined, {
    unit: "millisecond",
    style: 'unit',
    unitDisplay: "short",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  const clsFormatter = new Intl.NumberFormat(undefined, {
    unitDisplay: "short",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

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
        rating: null,
      },
      cls: {
        value: null,
        rating: null,
      },
      inp: {
        value: null,
        rating: null,
      },
      fcp: {
        value: null,
        rating: null,
      },
      ttfb: {
        value: null,
        rating: null,
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
    const overallScore = (
      metrics.lcp.rating === 'good' &&
      (metrics.cls.rating === 'good' || metrics.cls.rating === null) &&
      (metrics.inp.rating === 'good' || metrics.inp.rating === null)
    ) ? 'GOOD' : 'POOR';
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
    badgeMetrics[metric.name.toLowerCase()].rating = metric.rating;
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
    let formattedValue;
    switch(metric.name) {
      case 'CLS':
        formattedValue = clsFormatter.format(metric.value);
        break;
      case 'INP':
      case 'Interaction':
        formattedValue = millisecondsFormatter.format(metric.value);
        break;
      default:
        formattedValue = secondsFormatter.format(metric.value / 1000);
    }

    // Log the EOL warning at the same time as TTFB, which should only occur once per page load.
    if (metric.name === 'TTFB') {
      console.warn(`${LOG_PREFIX} As of January 2025, support for the Web Vitals extension has ended. We encourage all users to switch to the DevTools Performance panel instead. Learn more: https://developer.chrome.com/blog/web-vitals-extension`);
    }

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
        'LCP sub-part': 'Time to first byte',
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
        'FCP sub-part': 'Time to first byte',
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

    else if ((metric.name == 'INP'|| metric.name == 'Interaction') && metric.attribution) {
      const eventTarget = metric.attribution.interactionTargetElement;
      console.log('Interaction target:', eventTarget || metric.attribution.interactionTarget);
      console.log(`Interaction event type: %c${metric.attribution.interactionType}`, 'font-family: monospace');

      // Sub parts are only available for INP events and not Interactions
      if (metric.name == 'INP') {
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
      }

      if (metric.attribution.longAnimationFrameEntries) {

        const allScripts = metric.attribution.longAnimationFrameEntries.map(a => a.scripts).flat();

        if (allScripts.length > 0) {

          const sortedScripts = allScripts.sort((a,b) => b.duration - a.duration);

          // Pull out the pieces of interest for console table
          scriptData = sortedScripts.map((a) => (
                {
                  'Duration': Math.round(a.duration, 0),
                  'Type': a.invokerType || null,
                  'Invoker': a.invoker || null,
                  'Function': a.sourceFunctionName || null,
                  'Source (links below)': a.sourceURL || null,
                  'Char position': a.sourceCharPosition || null
                }
          ));
          console.log("Long Animation Frame scripts:");
          console.table(scriptData);

          // Get a list of scripts by sourceURL so we can log to console for
          // easy linked lookup. We won't include sourceCharPosition as
          // Devtools doesn't support linking to a character position and only
          // line numbers.
          const scriptsBySource = sortedScripts.reduce((acc, {sourceURL, duration}) => {
            if (sourceURL) { // Exclude empty URLs
              (acc[sourceURL] = acc[sourceURL] || []).push(duration);
            }
            return acc;
          }, {});

          for (const [key, value] of Object.entries(scriptsBySource)) {
            console.log(`Script source link: ${key} (Duration${value.length > 1 ? 's' : ''}: ${value})`);
          }

        }
      }
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
        <div class="lh-metric lh-metric--${metrics.lcp.rating}">
          <div class="lh-metric__innerwrap">
            <div>
              <span class="lh-metric__title">Largest Contentful Paint</span>
              ${tabLoadedInBackground ? '<span class="lh-metric__subtitle">Value inflated as tab was loaded in background</span>' : ''}
            </div>
            <div class="lh-metric__value">${secondsFormatter.format((metrics.lcp.value || 0)/1000)}</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.cls.rating}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">Cumulative Layout Shift</span>
            <div class="lh-metric__value">${clsFormatter.format( metrics.cls.value || 0)}</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.inp.rating} lh-metric--${metrics.inp.value === null ? 'waiting' : 'ready'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">
              Interaction to Next Paint
              <span class="lh-metric-state">${metrics.inp.value === null ? '(waiting for input)' : ''}</span>
            </span>
            <div class="lh-metric__value">${
              metrics.inp.value === null ? '' : `${millisecondsFormatter.format(metrics.inp.value)}`
            }</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.fcp.rating}">
          <div class="lh-metric__innerwrap">
            <div>
              <span class="lh-metric__title">First Contentful Paint</span>
              ${tabLoadedInBackground ? '<span class="lh-metric__subtitle">Value inflated as tab was loaded in background</span>' : ''}
            </div>
            <div class="lh-metric__value">${secondsFormatter.format((metrics.fcp.value || 0)/1000)}</div>
          </div>
        </div>
        <div class="lh-column">
          <div class="lh-metric lh-metric--${metrics.ttfb.rating}">
            <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">
              Time to First Byte
            </span>
            <div class="lh-metric__value">${secondsFormatter.format((metrics.ttfb.value || 0)/1000)}</div>
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
