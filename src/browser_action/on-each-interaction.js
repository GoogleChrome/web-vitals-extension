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

  for (const entry of list.getEntries()) { recentLoAFs.push(entry) };
  // We report interactions immediately, so don't need to keep many LoAFs around.
  // Let's keep the last 5.
  recentLoAFs = recentLoAFs.slice(-5);

});
loafObserver.observe({
  type: 'long-animation-frame',
  buffered: true,
});

/**
 * We emulate an INP entry with similar logic to web-vitals.js
 * But we have it easier as will emit it immediately and don't need the p98 stuff
 * So can strip a lot of that logic out.
 * @param {Function} callback
 */
export function onEachInteraction(callback) {

  const valueToRating = (score) => score <= 200 ? 'good' : score <= 500 ? 'needs-improvement' : 'poor';

  const observer = new PerformanceObserver((list) => {

    const allEvents = list.getEntries();

    // filter just for INP-eligible events (those with an interactionId)
    const interactions = allEvents.filter((entry) => entry.interactionId)
    // If none then can just end
    if (interactions.length == 0 ) return;

    const longestEntry = interactions.reduce((prev, curr) => prev.duration >= curr.duration ? prev : curr);
    const largestDuration = longestEntry.duration;
    const largestRenderTime = longestEntry.startTime + longestEntry.duration;

    const longestFrameEntries = [];
    let groupStartTime;
    let groupProcessingStart;
    let groupProcessingEnd;

    // Go though the list of all events (not just those with interactionIds)
    // to get details of what was in the longest frame and the earliest and latest event timestamps
    for (const entry of allEvents) {
        const renderTime = entry.startTime + entry.duration;
        // If a previous render time is within 8ms of the largest render time,
        // assume they were part of the same frame so include them
        if (Math.abs(renderTime - largestRenderTime) <= 8) {
          longestFrameEntries.push(entry);
          groupStartTime = groupStartTime ? Math.min(entry.startTime, groupStartTime) : entry.startTime;
          groupProcessingStart = groupProcessingStart ?
            Math.min(
              entry.processingStart,
              groupProcessingStart,
            ) :
            entry.processingStart;
          groupProcessingEnd = groupProcessingEnd ? Math.max(entry.processingEnd, groupProcessingEnd) : entry.processingEnd;
        }
    }

    // For the breakdowns we need to know the first and last interaction events (i.e. those with interactionIds) in that longest list
    const longestFrameInteractionEntries = longestFrameEntries.filter((entry) => entry.interactionId);
    // Entries should be in order so can use that to find first
    const firstInteractionEntry = longestFrameInteractionEntries[0];
    const firstEventEntry = longestFrameEntries[0];
    const lastEventEntry = longestFrameEntries.slice(-1);

    // Filter further to get the entries entry (the longest interactionId events with the longest durations)
    const longestInteractionEntries = longestFrameInteractionEntries.filter((entry) => entry.interactionId  === longestEntry.interactionId && entry.duration === largestDuration);

    // Sometimes target is not set so look across all events with that interactionId to get it
    const firstInteractionEntryWithTarget = interactions.find((entry) => longestEntry.interactionId === longestEntry.interactionId && entry.target);

    // Filter down LoAFs to ones that intersected any event startTime and any processingEnd
    // The LoAF processing the last script in that frame will then present that frame so
    // we get rAF and other rendering work too with this interaction.
    const longAnimationFrameEntries = getIntersectingLoAFs(groupStartTime, groupProcessingEnd)

    // Since entry durations are rounded to the nearest 8ms, we need to clamp
    // the `nextPaintTime` value to be higher than the `groupProcessingEnd` or
    // end time of any LoAF entry.
    const nextPaintTimeCandidates = [
      firstEventEntry.startTime + firstEventEntry.duration,
      groupProcessingEnd,
    ].concat(
      longAnimationFrameEntries.map((loaf) => loaf.startTime + loaf.duration),
    );
    const nextPaintTime = Math.max.apply(Math, nextPaintTimeCandidates);

    // Gather that all in a similar structure to an INP attribution object and send it back
    callback({
      name: 'Interaction',
      value: largestDuration,
      rating: valueToRating(largestDuration),
      entries: longestInteractionEntries,
      attribution: {
        inputDelay: firstEventEntry.processingStart - firstEventEntry.startTime,
        interactionTarget: firstInteractionEntryWithTarget?.target,
        interactionTime: firstInteractionEntry.startTime,
        interactionType: firstInteractionEntryWithTarget?.name?.startsWith('key') ? 'keyboard' : 'pointer',
        longAnimationFrameEntries: longAnimationFrameEntries,
        nextPaintTime: nextPaintTime,
        presentationDelay: nextPaintTime - lastEventEntry.processingEnd,
        processedEventEntries: longestFrameEntries,
        processingDuration: lastEventEntry.processingEnd - firstEventEntry.processingStart,
      },
    });
  });

  observer.observe({
    type: 'event',
    durationThreshold: 0,
    buffered: true,
  });
}
