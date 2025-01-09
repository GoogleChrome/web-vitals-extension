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

import { loadLocalMetrics, getOptions, getURL } from './chrome.js';
import { CrUX } from './crux.js';
import { LCP, INP, CLS, FCP, TTFB } from './metric.js';

class Popup {

  constructor({metrics, background, options, url, error}) {
    if (error) {
      console.log(error);
      this.setStatus('Web Vitals are unavailable for this page.\n' + error);
      return;
    }

    const {timestamp, ..._metrics} = metrics;
    // Format as a short timestamp (HH:MM:SS).
    const formattedTimestamp = new Date(timestamp).toLocaleTimeString('en-US', {hourCycle: 'h23'});

    this.timestamp = formattedTimestamp;
    this._metrics = _metrics;
    this.background = background;
    this.options = options;
    this.metrics = {};
    this.url = url;

    this.init();
  }

  init() {
    this.initStatus();
    this.initPage();
    this.initTimestamp();
    this.initMetrics();
    this.initFieldData();
    this.showEOLNotice();
  }

  initStatus() {
    this.setStatus('Loading field data…');
  }

  initPage() {
    this.setPage(this.url);
  }

  initTimestamp() {
    const timestamp = document.getElementById('timestamp');
    timestamp.innerText = this.timestamp;
  }

  initMetrics() {
    this.metrics.lcp = new LCP({
      local: this._metrics.lcp.value,
      rating: this._metrics.lcp.rating,
      background: this.background
    });
    this.metrics.cls = new CLS({
      local: this._metrics.cls.value,
      rating: this._metrics.cls.rating,
      background: this.background
    });
    this.metrics.inp = new INP({
      local: this._metrics.inp.value,
      rating: this._metrics.inp.rating,
      background: this.background
    });
    this.metrics.fcp = new FCP({
      local: this._metrics.fcp.value,
      rating: this._metrics.fcp.rating,
      background: this.background
    });
    this.metrics.ttfb = new TTFB({
      local: this._metrics.ttfb.value,
      rating: this._metrics.ttfb.rating,
      background: this.background
    });

    this.renderMetrics();
  }

  initFieldData() {
    const formFactor = this.options.preferPhoneField ? CrUX.FormFactor.PHONE : CrUX.FormFactor.DESKTOP;
    CrUX.load(this.url, formFactor).then(fieldData => {
      console.log('CrUX data', fieldData);
      this.renderFieldData(fieldData, formFactor);
    }).catch(e => {
      console.warn('Unable to load any CrUX data. See https://developer.chrome.com/blog/web-vitals-extension', e);
      this.setStatus('Local metrics only (field data unavailable)');
    });
  }

  showEOLNotice() {
    chrome.storage.sync.get({hideEOLNotice: false}, ({hideEOLNotice}) => {
      if (hideEOLNotice) {
        return;
      }
      const notice = document.getElementById('eol-notice');
      notice.showPopover();
      const hideNoticeToggle = document.getElementById('hide-eol-notice');
      hideNoticeToggle.addEventListener('change', (e) => {
        chrome.storage.sync.set({hideEOLNotice: e.target.checked});
      });
    });
  }

  setStatus(status) {
    const statusElement = document.getElementById('status');

    if (typeof status === 'string') {
      statusElement.innerText = status;
    } else {
      statusElement.replaceChildren(status);
    }
  }

  setPage(url) {
    const page = document.getElementById('page');
    page.innerText = url;
    page.title = url;
  }

  setDevice(formFactor) {
    const deviceElement = document.querySelector('.device-icon');
    deviceElement.classList.add(`device-${formFactor.toLowerCase()}`);
  }

  setHovercardText(metric, fieldData, formFactor='') {
    const hovercard = document.querySelector(`#${metric.id} .hovercard`);
    const abbr = metric.abbr;
    const local = metric.formatValue(metric.local);
    const assessment = metric.rating;
    let text = `Your local <strong>${abbr}</strong> experience is <strong class="hovercard-local">${local}</strong> and rated <strong class="hovercard-local">${assessment}</strong>.`;

    if (fieldData) {
      const assessmentIndex = metric.getAssessmentIndex(metric.rating);
      const density = metric.getDensity(assessmentIndex, 0);
      const scope = CrUX.isOriginFallback(fieldData) ? 'origin' : 'page';
      text += ` <strong>${density}</strong> of <span class="nowrap">real-user</span> ${formFactor.toLowerCase()} <strong>${abbr}</strong> experiences on this ${scope} were also rated <strong class="hovercard-local">${assessment}</strong>.`
    }

    hovercard.innerHTML = text;
  }

  renderMetrics() {
    Object.values(this.metrics).forEach(this.renderMetric.bind(this));
  }

  renderMetric(metric) {
    const template = document.getElementById('metric-template');
    const fragment = template.content.cloneNode(true);
    const metricElement = fragment.querySelector('.metric-wrapper');
    const name = fragment.querySelector('.metric-name');
    const local = fragment.querySelector('.metric-performance-local');
    const localValue = fragment.querySelector('.metric-performance-local-value');
    const infoElement = fragment.querySelector('.info');
    const info = metric.getInfo() || '';
    const rating = metric.rating;

    metricElement.id = metric.id;
    name.innerText = metric.name;
    local.style.marginLeft = metric.getRelativePosition(metric.local);
    localValue.innerText = metric.formatValue(metric.local);
    metricElement.classList.toggle(rating, !!rating);
    infoElement.title = info;
    infoElement.classList.toggle('hidden', info == '');

    template.parentElement.appendChild(fragment);

    requestAnimationFrame(_ => {
      // Check reversal before and after the transition is settled.
      this.checkReversal(metric);
      this.setHovercardText(metric);
    });
    this.whenSettled(metric).then(_ => this.checkReversal(metric));
  }

  checkReversal(metric) {
    const container = document.querySelector(`#${metric.id} .metric-performance`);
    const local = document.querySelector(`#${metric.id} .metric-performance-local`);
    const localValue = document.querySelector(`#${metric.id} .metric-performance-local-value`);

    const containerBoundingRect = container.getBoundingClientRect();
    const localValueBoundingRect = localValue.getBoundingClientRect();
    const isOverflow = localValueBoundingRect.right > containerBoundingRect.right;

    local.classList.toggle('reversed', isOverflow || local.classList.contains('reversed'));
  }

  renderFieldData(fieldData, formFactor) {
    if (CrUX.isOriginFallback(fieldData)) {
      const fragment = document.createDocumentFragment();
      const span = document.createElement('span');
      span.innerHTML = `Page-level field data is not available<br>Comparing local metrics to <strong>origin-level ${formFactor.toLowerCase()} field data</strong> instead`;
      fragment.appendChild(span);
      this.setStatus(fragment);
      this.setPage(CrUX.getOrigin(fieldData));
    } else {
      this.setStatus(`Local metrics compared to ${formFactor.toLowerCase()} field data`);

      const normalizedUrl = CrUX.getNormalizedUrl(fieldData);
      if (normalizedUrl) {
        this.setPage(normalizedUrl);
      }
    }

    const metrics = CrUX.getMetrics(fieldData).forEach(({id, data}) => {
      const metric = this.metrics[id];
      if (!metric) {
        // The API may return additional metrics that we don't support.
        return;
      }

      metric.distribution = CrUX.getDistribution(data);

      const local = document.querySelector(`#${metric.id} .metric-performance-local`);
      local.style.marginLeft = metric.getRelativePosition(metric.local);

      ['good', 'needs-improvement', 'poor'].forEach((rating, i) => {
        const ratingElement = document.querySelector(`#${metric.id} .metric-performance-distribution-rating.${rating}`);

        ratingElement.innerText = metric.getDensity(i);
        ratingElement.style.setProperty('--rating-width', metric.getDensity(i, 2));
        ratingElement.style.setProperty('--min-rating-width', `${metric.MIN_PCT * 100}%`);
      });

      this.setDevice(formFactor);
      this.setHovercardText(metric, fieldData, formFactor);
      this.whenSettled(metric).then(_ => this.checkReversal(metric));
    });
  }

  whenSettled(metric) {
    const local = document.querySelector(`#${metric.id} .metric-performance-local`);
    return new Promise(resolve => {
      local.addEventListener('transitionend', resolve);
    });
  }

}

Promise.all([loadLocalMetrics(), getOptions(), getURL()]).then(([localMetrics, options, url]) => {
  window.popup = new Popup({...localMetrics, options, url});
});
