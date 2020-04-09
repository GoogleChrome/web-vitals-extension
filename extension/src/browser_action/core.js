const API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?';
let encodedUrl = '';
let currentTab = 0;

function fetchReportForTab() {
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, tabs => {
        const url = tabs[0].url;
        console.log(`Active tab URL is ${url}`);
        encodedUrl = encodeURIComponent(url);
        fetchAPIResults(encodedUrl);
        currentTab = tabs[0].id;
        chrome.browserAction.setBadgeText({
            text: '',
            tabId: currentTab
        });
        // TODO: Show a loading state?
    });
}

async function fetchAPIResults(url) {
    const query = [
        'url=url%3A' + url
        // 'key=' + API_KEY,
    ].join('&');
    const queryURL = API_URL + query;

    console.log(`Fetching PSI results from ${queryURL}`);
    // const response = await fetch('test.json');
    try {
        const response = await fetch(queryURL);
        const json = await response.json();
        console.log(`Response from PSI was ${json}`);
        processResults(json);
    } catch (err) {
        const el = document.getElementById('report');
        el.innerHTML = `We were unable to process your request.`;
    }
}

function processResults(result) {
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

    updateBadgeIcon(overall_category);
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
    return `<br><a href='https://developers.google.com/speed/pagespeed/insights/?url=${encodedUrl}' target='_blank'>View Report on PageSpeed Insights</a>`;
}

function updateBadgeColor(overall_category) {
    chrome.browserAction.setBadgeText({ text: overall_category, tabId: currentTab });
    // Adjust badging
    switch (overall_category) {
        case 'SLOW':
            chrome.browserAction.setBadgeBackgroundColor({ color: "red", tabId: currentTab });
            break;
        case 'AVERAGE':
            chrome.browserAction.setBadgeBackgroundColor({ color: "orange", tabId: currentTab });
            break;
        case 'FAST':
            chrome.browserAction.setBadgeBackgroundColor({ color: "green", tabId: currentTab });
            break;
        default:
            chrome.browserAction.setBadgeBackgroundColor({ color: "white", tabId: currentTab });
            chrome.browserAction.setBadgeText({ text: '', tabId: currentTab });
            break;
    }
}

function updateBadgeIcon(overall_category) {
    chrome.browserAction.setIcon({
        path: '../../icons/default128w.png',
        tabId: currentTab
    });
    // Adjust badging
    switch (overall_category) {
        case 'SLOW':
            chrome.browserAction.setIcon({
                path: '../../icons/slow128w.png',
                tabId: currentTab
            });
            break;
        case 'AVERAGE':
            chrome.browserAction.setIcon({
                path: '../../icons/average128w.png',
                tabId: currentTab
            });
            break;
        case 'FAST':
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

function formatDisplayValue(metricName, metricValueMs) {
    if (metricValueMs === undefined) {
        return null;
    }
    if (metricName === 'First Input Delay (FID)') {
        return Number(metricValueMs.toFixed(0)) + ' ms';
    } else {
        return Number((metricValueMs / 1000).toFixed(1)) + ' s';
    }
};

window.addEventListener('load', () => {
    fetchReportForTab();
});