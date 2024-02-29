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

let longAnimationFrames = [];

export function initLoAF() {
  // Monitor LoAFs
  if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
    new PerformanceObserver(entries => {
      longAnimationFrames = longAnimationFrames.concat(entries.getEntries());
    }).observe({
      type: 'long-animation-frame',
      buffered: true
    });
  }
}

export function addLoafAttribution(metric) {
  const entry = metric.attribution.eventEntry;
  const loaf = longAnimationFrames.filter((loaf) => {
    return entry.startTime < (loaf.startTime + loaf.duration) && loaf.startTime < (entry.startTime + entry.duration);
  })[0];

  if (!loaf) {
    return metric;
  }

  // Sort event entries by processing start time.
  const events = metric.entries.sort((a,b) => {
    return a.processingStart - b.processingStart;
  });

  Object.assign(metric.attribution, getInteractionPhases(loaf, events), {
    longAnimationFrames: loaf
  });

  return metric;
}

/**
 * @param {Function} callback
 */
export function onEachInteraction(callback) {
  const valueToRating = (score) => score <= 200 ? 'good' : score <= 500 ? 'needs-improvement' : 'poor';

  const observer = new PerformanceObserver((list) => {
    let eventEntries = Array.from(list.getEntries());

    // Ignore events without interactions.
    if (!eventEntries.some(entry => entry.interactionId > 0)) {
      return;
    }

    // Sort event entries by processing start time.
    eventEntries = eventEntries.sort((a,b) => {
      return a.processingStart - b.processingStart;
    });

    // Group event timing entries by frame.
    // Filter down just to frames with "interactions".
    let interactions = splitByFrame(eventEntries).filter(data => {
      return data.events.some(entry => entry.interactionId > 0);
    });

    // The interaction may not have occurred within a long animation frame.
    // We still want to log the interaction, so we'll give it a null loaf entry.
    if (interactions.length === 0) {
      interactions = [{
        loaf: null,
        events: eventEntries
      }];
    }

    for (const { loaf, events } of interactions) {
      const entry = events.reduce((prev, curr) => prev.duration >= curr.duration ? prev : curr);
      const value = entry.duration;

      callback({
        attribution: {
          eventEntry: entry,
          eventTime: entry.startTime,
          eventType: entry.name,
          ...getInteractionPhases(loaf, events),
          longAnimationFrames: loaf,
        },
        entries: events,
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

function getInteractionPhases(loaf, events) {
  if (!loaf) {
    return {};
  }

  let maxPresentationTime = 0;
  let totalProcessingTime = 0;
  let prevEnd = 0;
  for (let { startTime, processingStart, processingEnd, duration } of events) {
    maxPresentationTime = Math.max(maxPresentationTime, processingEnd, startTime + duration);
    totalProcessingTime += processingEnd - Math.max(processingStart, prevEnd);
    prevEnd = processingEnd;
  }

  const processingStart = events[0].processingStart;
  const processingEnd = events.at(-1).processingEnd;
  const processingDuration = processingEnd - processingStart;
  let percent;
  if (processingDuration > 0) {
    percent = totalProcessingTime / processingDuration * 100;
  }

  const renderStart = Math.max(loaf.renderStart, processingEnd);
  const renderEnd = loaf.startTime + loaf.duration;

  // Both event presentation times and loaf renderEnd are rounded, so sometimes one laps the other slightly...
  const interactionEndTime = Math.max(maxPresentationTime, renderEnd);

  return {
    inputDelay: processingStart - events[0].startTime,
    processingDuration: processingEnd - processingStart,
    processingPercentage: percent,
    renderingDelay: renderStart - processingEnd,
    renderingDuration: renderEnd - renderStart,
    presentationDelay: interactionEndTime - renderEnd
  };
}

// Use LoAF entries to group event timing entries by frame
function splitByFrame(eventEntries) {
	const framesByStartTime = {};

	for (let entry of eventEntries) {
		// Process the LoAF queue one at a time
		// Once we find the right loaf entry, we stop iterating
		for (let loaf of longAnimationFrames) {
			const renderEnd = loaf.startTime + loaf.duration;

			// This event is obviously before the current loaf entry
			// This shouldn't happen, except when using buffered:true
			if (entry.processingEnd < loaf.startTime) {
        break;
      }

			// This event is for a future frame
			if (entry.processingStart > renderEnd) {
        continue;
      }

			// Assert: loaf.startTime <= entry.processingStart
			// Assert: renderEnd >= entry.processingEnd

			framesByStartTime[loaf.startTime] ??= { loaf, events: [] };
			framesByStartTime[loaf.startTime].events.push(entry);
			break;
		}
	}

	return Object.values(framesByStartTime);
}
