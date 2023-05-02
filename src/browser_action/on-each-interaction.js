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

/**
 * @param {Function} callback
 */
export function onEachInteraction(callback) {
  const valueToRating = (score) => score <= 200 ? 'good' : score <= 500 ? 'needs-improvement' : 'poor';

  const observer = new PerformanceObserver((list) => {
    const interactions = {};

    for (const entry of list.getEntries().filter((entry) => entry.interactionId)) {
      interactions[entry.interactionId] = interactions[entry.interactionId] || [];
      interactions[entry.interactionId].push(entry);
    }

    // Will report as a single interaction even if parts are in separate frames.
    // Consider splitting by animation frame.
    for (const interaction of Object.values(interactions)) {
      const entry = interaction.reduce((prev, curr) => prev.duration >= curr.duration ? prev : curr);
      const value = entry.duration;

      callback({
        attribution: {
          eventEntry: entry,
          eventTime: entry.startTime,
          eventType: entry.name,
        },
        entries: interaction,
        name: 'Interaction',
        rating: valueToRating(value),
        value,
      });
    }
  });

  observer.observe({
    type: 'event',
    durationThreshold: 0,
    buffered: true,
  });
}
