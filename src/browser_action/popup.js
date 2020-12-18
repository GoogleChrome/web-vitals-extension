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
import { LCP, FID, CLS } from './metric.js';

class Popup {

  constructor({metrics, background}) {
    console.log('Popup', metrics, background)

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
  }

  initStatus() {
    const status = document.getElementById('status');
    status.innerText = '';
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

    requestAnimationFrame(this.checkReversal.bind(this, metric));
  }

  checkReversal(metric) {
    const container = document.querySelector(`#${metric.id} .metric-performance`);
    const local = document.querySelector(`#${metric.id} .metric-performance-local`);
    const localValue = document.querySelector(`#${metric.id} .metric-performance-local-value`);

    const containerBoundingRect = container.getBoundingClientRect();
    const localValueBoundingRect = localValue.getBoundingClientRect();
    const isOverflow = localValueBoundingRect.right > containerBoundingRect.right;

    local.classList.toggle('reversed', isOverflow);
  }

}

loadLocalMetrics(result => {
  new Popup(result);
});