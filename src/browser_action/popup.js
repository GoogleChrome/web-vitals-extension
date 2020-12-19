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

import { loadLocalMetrics } from './chrome.js';
import { CrUX } from './crux.js';
import { LCP, FID, CLS } from './metric.js';


class Popup {

  constructor({metrics, background, error}) {
    if (error) {
      console.error(error);
      this.setStatus('Web Vitals are unavailble for this page');
      return;
    }

    const {location, timestamp, ..._metrics} = metrics;

    this.location = location;
    this.timestamp = timestamp;
    this._metrics = _metrics;
    this.background = background;
    this.metrics = {};

    this.init();
  }

  init() {
    this.initStatus();
    this.initPage();
    this.initTimestamp();
    this.initMetrics();
    this.initFieldData();
  }

  initStatus() {
    this.setStatus('Loading field data…');
  }

  initPage() {
    this.setPage(this.location.url);
  }

  initTimestamp() {
    const timestamp = document.getElementById('timestamp');
    timestamp.innerText = this.timestamp;
  }

  initMetrics() {
    this.metrics.lcp = new LCP({
      local: this._metrics.lcp.value,
      finalized: this._metrics.lcp.final
    });
    this.metrics.fid = new FID({
      local: this._metrics.fid.value,
      finalized: this._metrics.fid.final
    });
    this.metrics.cls = new CLS({
      local: this._metrics.cls.value,
      finalized: this._metrics.cls.final
    });

    this.renderMetrics();
  }

  initFieldData() {
    CrUX.load(this.location.url).then(fieldData => {
      console.log('CrUX data', fieldData);
      this.renderFieldData(fieldData);
    }).catch(e => {
      console.warn('Unable to load any CrUX data', e);
      this.setStatus('Local metrics only (field data unavailble)');
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

  renderMetrics() {
    Object.values(this.metrics).forEach(this.renderMetric.bind(this));
  }

  renderMetric(metric) {
    const template = document.getElementById('metric-template');
    const fragment = template.content.cloneNode(true);
    const metricElement = fragment.querySelector('.metric-wrapper ');
    const name = fragment.querySelector('.metric-name');
    const local = fragment.querySelector('.metric-performance-local');
    const localValue = fragment.querySelector('.metric-performance-local-value');
    const assessment = metric.getAssessment(metric.local);

    metricElement.id = metric.id;
    name.innerText = metric.name;
    local.style.marginLeft = metric.getRelativePosition(metric.local);
    localValue.innerText = metric.formatValue(metric.local);
    metricElement.classList.add(assessment);

    template.parentElement.appendChild(fragment);

    // Check reversal before and after the transition is settled.
    requestAnimationFrame(_ => this.checkReversal(metric));
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

  renderFieldData(fieldData) {
    if (CrUX.isOriginFallback(fieldData)) {
      const fragment = document.createDocumentFragment();
      const span = document.createElement('span');
      span.innerHTML = 'Page-level field data is not available<br>Comparing local metrics to <strong>origin-level field data</strong> instead';
      fragment.appendChild(span);
      this.setStatus(fragment);
      this.setPage(CrUX.getOrigin(fieldData));
    } else {
      this.setStatus('Local metrics compared to field data');

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

loadLocalMetrics(result => {
  window.popup = new Popup(result);
});
