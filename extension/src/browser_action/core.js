
console.log('core.js running....');
!function(e,n){"object"==typeof exports&&"undefined"!=typeof module?n(exports):"function"==typeof define&&define.amd?define(["exports"],n):n((e=e||self).webVitals={})}(this,(function(e){"use strict";var n=function(e,n,t,i,r){return function(){t&&(t.takeRecords().map(i),t.disconnect()),"number"==typeof n.value&&(n.isFinal||(n.isFinal=!0,r&&r(n)),e(n))}},t=function(e,n){try{if(PerformanceObserver.supportedEntryTypes.includes(e)){var t=new PerformanceObserver((function(e){return e.getEntries().map(n)}));return t.observe({type:e,buffered:!0}),t}}catch(e){}},i=function(e){return function(n){var t={value:null,entries:[],isFinal:!1};return new Promise((function(i){return e(t,i,n)}))}},r=new Promise((function(e){return["visibilitychange","unload"].map((function(n){return function(e,n){addEventListener(e,(function t(i){"hidden"===document.visibilityState&&(removeEventListener(e,t,!0),n(i))}),!0)}(n,e)}))})),u=i((function(e,i,u){e.value=0;var o=function(n){n.hadRecentInput||(e.value+=n.value,e.entries.push(n),u&&u(e))},s=t("layout-shift",o),a=n(i,e,s,o,u);r.then(a)})),o="hidden"===document.visibilityState?0:1/0;r.then((function(e){return o=e.timeStamp}));var s=function(){return o},a=i((function(e,i,r){var u=function(n){"first-contentful-paint"===n.name&&n.startTime<s()&&(e.value=n.startTime,e.entries.push(n),a())},o=t("paint",u),a=n(i,e,o,u,r)})),c=i((function(e,i,u){var o=function(n){e.value=n.processingStart-n.startTime,e.entries.push(n),a()},s=t("first-input",o),a=n(i,e,s,o,u);r.then(a),s||window.perfMetrics&&window.perfMetrics.onFirstInputDelay&&window.perfMetrics.onFirstInputDelay((function(n,t){e.value=n,e.event=t,a()}))})),f=new Promise((function(e){return["scroll","keydown","pointerdown"].map((function(n){addEventListener(n,e,{once:!0,passive:!0,capture:!0})}))})),p=i((function(e,i,u){var o=!0,a=function(n){o&&s()<n.startTime?p():(e.value=n.startTime,e.entries.push(n),u&&u(e),o=!1)},c=t("largest-contentful-paint",a),p=n(i,e,c,a,u);r.then(p),f.then(p)}));e.getCLS=u,e.getFCP=a,e.getFID=c,e.getLCP=p,Object.defineProperty(e,"__esModule",{value:!0})}));

// Registry for badge metrics
badgeMetrics = {
    lcp: 0,
    cls: 0,
    fid: 0
};

/**
 * @param  {Object} metrics - Collection of metric values
 * If any metric fails the thresholds at all, we display
 * a red badge.
 */
function scoreBadgeMetrics(metrics) {
    let bucket = 'GOOD';
    if (metrics.lcp > 2500) {
        bucket = 'POOR';
    }
    if (metrics.fid > 0.1) {
        bucket = 'POOR';
    }
    if (metrics.cls > 0.1) {
        bucket = 'POOR';
    }
    return bucket;
}

// Each time a metric value updates, the registry
// is also updated.
function updateBadgeValue(metric, value, isFinal) {
    console.log(metric, value, isFinal ? '(final)' : '(not final)');
    // scoreBucket = GOOD, NI, POOR
    badgeMetrics[metric] = value;
    let scoreBucket = scoreBadgeMetrics(badgeMetrics);
    console.log(scoreBucket);
    console.log(badgeMetrics);

    chrome.runtime.sendMessage({ result: scoreBucket });
}

/**
 * Fetches Web Vitals metrics via WebVitals.js
 * We will update the metrics using onChange.
 */
function fetchWebPerfMetrics() {
    webVitals.getCLS((result) => updateBadgeValue('cls', result.value, result.isFinal));
    webVitals.getFID((result) => updateBadgeValue('fid', result.value, result.isFinal));
    webVitals.getLCP((result) => updateBadgeValue('lcp', result.value, result.isFinal));
}

fetchWebPerfMetrics();