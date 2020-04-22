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

const API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?';
const FE_URL = 'https://developers.google.com/speed/pagespeed/insights/';
const encodedUrl = '';
// const resultsFetched = false;

/**
 *
 * Hash the URL and return a numeric hash as a String
 * to be used as the key
 * @param {String} str
 * @returns
 */
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

/*
async function fetchAPIResults(url) {
  if (resultsFetched) {
    return;
  }
  const query = [
    'url=url%3A' + url,
    // 'key=' + API_KEY,
  ].join('&');
  const queryURL = API_URL + query;
  try {
    const response = await fetch(queryURL);
    const json = await response.json();
    createPSITemplate(json);
  } catch (err) {
    const el = document.getElementById('report');
    el.innerHTML = `We were unable to process your request.`;
  }
}*/

/**
 *
 * Build the PSI template to render in the pop-up
 * @param {Object} result
 */
/*
function createPSITemplate(result) {
  const experience = result.loadingExperience;
  const metrics = experience.metrics;
  const overall_category = experience.overall_category;
  const fcp = metrics.FIRST_CONTENTFUL_PAINT_MS;
  const fid = metrics.FIRST_INPUT_DELAY_MS;

  const fcp_template = buildDistributionTemplate(fcp, 'First Contentful Paint (FCP)');
  const fid_template = buildDistributionTemplate(fid, 'First Input Delay (FID)');
  const link_template = buildPSILink();
  const tmpl = `<h1>Origin Performance (${overall_category})</h1> ${fcp_template} ${fid_template} ${link_template}`;
  const el = document.getElementById('report');
  el.innerHTML = tmpl;
  // TODO: Implement per-tab/URL report caching scheme
  resultsFetched = true;
}*/

/**
 *
 * Construct a WebVitals.js metrics template for display at the
 * top of the pop-up. Consumes a custom metrics object provided
 * by vitals.js.
 * @param {Object} metrics
 * @returns
 */
function buildLocalMetricsTemplate(metrics) {
  return `
    <div class="lh-audit-group lh-audit-group--metrics">
    <div class="lh-audit-group__header"><span class="lh-audit-group__title">Metrics</span></div>
    <div class="lh-columns">
      <div class="lh-column">
        <div class="lh-metric lh-metric--${metrics.lcp.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">Largest Contentful Paint <span class="lh-metric-state">${metrics.lcp.final ? '(final)' : '(not final)'}</span></span>
            <div class="lh-metric__value">${(metrics.lcp.value/1000).toFixed(2)}&nbsp;s</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.fid.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">First Input Delay <span class="lh-metric-state">${metrics.fid.final ? '(final)' : '(not final)'}</span></span>
            <div class="lh-metric__value">${metrics.fid.value.toFixed(2)}&nbsp;ms</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.cls.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">Cumulative Layout Shift <span class="lh-metric-state">${metrics.cls.final ? '(final)' : '(not final)'}</span></span>
            <div class="lh-metric__value">${metrics.cls.value.toFixed(3)}&nbsp;</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/**
 *
 * Render a WebVitals.js metrics table in the pop-up window
 * @param {Object} metrics
 * @returns
 */
function renderLocalMetricsTemplate(metrics) {
  // if (metrics === undefined || metrics.lcp === undefined) { return; }
  const el = document.getElementById('local-metrics');
  el.innerHTML = buildLocalMetricsTemplate(metrics);
}

function buildDistributionTemplate(metric, label) {
  return `<div class="field-data">
    <div class="metric-wrapper lh-column">
      <div class="lh-metric">
        <div class="field-metric ${metric.category.toLowerCase()} lh-metric__innerwrap">
          <span class="metric-description">${label}</span>
          <div class="metric-value lh-metric__value">${formatDisplayValue(label, metric.percentile)}</div></div>
        <div class="metric-chart">
          <div class="bar fast" style="flex-grow: 
          ${Math.floor(metric.distributions[0].proportion * 100)};">
          ${Math.floor(metric.distributions[0].proportion * 100)}%</div>
          <div class="bar average" style="flex-grow: 
          ${Math.floor(metric.distributions[1].proportion * 100)};">
          ${Math.floor(metric.distributions[1].proportion * 100)}%</div>
          <div class="bar slow" style="flex-grow: 
          ${Math.floor(metric.distributions[2].proportion * 100)};">
          ${Math.floor(metric.distributions[2].proportion * 100)}%</div>
        </div></div>
      </div>
    </div> `;
}

function buildPSILink() {
  return `<br><a href='${FE_URL}?url=${encodedUrl}' target='_blank'>
       View Report on PageSpeed Insights</a>`;
}

/**
 *
 * Format PSI API metric values
 * @param {String} metricName
 * @param {Number} metricValueMs
 * @returns
 */
function formatDisplayValue(metricName, metricValueMs) {
  if (metricValueMs === undefined) {
    return '';
  }
  if (metricName === 'First Input Delay (FID)') {
    return Number(metricValueMs.toFixed(0)) + ' ms';
  } else {
    return Number((metricValueMs / 1000).toFixed(1)) + ' s';
  }
};

chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  const thisTab = tabs[0];
  // TODO: Re-enable PSI support once LCP, CLS land
  // console.log(`popup: PSI API will be queried for URL ${thisTab.url}`);
  // fetchAPIResults(thisTab.url);

  // Retrieve the stored latest metrics
  if (thisTab.url) {
    const key = hashCode(thisTab.url);
    chrome.storage.local.get(key, (result) => {
      renderLocalMetricsTemplate(result[key]);
    });
  }
});
