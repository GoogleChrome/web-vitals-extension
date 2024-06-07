/*
 Copyright 2023 Google Inc. All Rights Reserved.
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

import {INPThresholds} from './web-vitals.js';

/**
 * @param {Function} callback
 */
export function onEachInteraction(callback) {
  const valueToRating = (score) => score <= INPThresholds[0] ? 'good' : score <= INPThresholds[1] ? 'needs-improvement' : 'poor';

  const eventObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const interactions = {};

    const getSelector = (node, maxLen) => {
      let sel = '';

      try {
        while (node && node.nodeType !== 9) {
          const el = node;
          const part = el.id
            ? '#' + el.id
            : getName(el) +
              (el.classList &&
              el.classList.value &&
              el.classList.value.trim() &&
              el.classList.value.trim().length
                ? '.' + el.classList.value.trim().replace(/\s+/g, '.')
                : '');
          if (sel.length + part.length > (maxLen || 100) - 1) return sel || part;
          sel = sel ? part + '>' + sel : part;
          if (el.id) break;
          node = el.parentNode;
        }
      } catch (err) {
        // Do nothing...
      }
      return sel;
    };

    // Filter all events to those with interactionids
    for (const entry of entries.filter((entry) => entry.interactionId)) {
      interactions[entry.interactionId] = interactions[entry.interactionId] || [];
      interactions[entry.interactionId].push(entry);
    }

    // Will report as a single interaction even if parts are in separate frames.
    // Consider splitting by animation frame.
    for (const interaction of Object.values(interactions)) {
      const entry = interaction.reduce((prev, curr) => prev.duration >= curr.duration ? prev : curr);
      const value = entry.duration;

      // Filter down LoAFs to ones that intersected any event startTime and any processingEnd
      const longAnimationFrameEntries = getIntersectingLoAFs(entry.startTime, entry.startTime + entry.value)

      const firstEntryWithTarget = interaction.find(entry => entry.target)?.target;

      callback({
        attribution: {
          interactionTarget: getSelector(firstEntryWithTarget),
          interactionTargetElement: firstEntryWithTarget,
          interactionTime: entry.startTime,
          interactionType: entry.name.startsWith('key') ? 'keyboard' : 'pointer',
          longAnimationFrameEntries: longAnimationFrameEntries
        },
        entries: interaction,
        name: 'Interaction',
        rating: valueToRating(value),
        value,
      });
    }
  });

  eventObserver.observe({
    type: 'event',
    durationThreshold: 0,
    buffered: true,
  });

  let recentLoAFs = [];

  const getIntersectingLoAFs = (start, end) => {
    const intersectingLoAFs = [];

    for (let i = 0, loaf; (loaf = recentLoAFs[i]); i++) {
      // If the LoAF ends before the given start time, ignore it.
      if (loaf.startTime + loaf.duration < start) continue;

      // If the LoAF starts after the given end time, ignore it and all
      // subsequent pending LoAFs (because they're in time order).
      if (loaf.startTime > end) break;

      // Still here? If so this LoAF intersects with the interaction.
      intersectingLoAFs.push(loaf);
    }
    return intersectingLoAFs;
  };

  const loafObserver = new PerformanceObserver((list) => {
    // We report interactions immediately, so don't need to keep many LoAFs around.
    // Let's keep the last 5.
    recentLoAFs = recentLoAFs.concat(list.getEntries()).slice(-5);

  });
  loafObserver.observe({
    type: 'long-animation-frame',
    buffered: true,
  });
}
