export function onEachInteraction(callback) {
	const valueToRating = score => score <= 200 ? 'good' : score <= 500 ? 'needs-improvement' : 'poor';
	let worst_inp = 0;
	
	const observer = new PerformanceObserver(list => {
		for (let entry of list.getEntries()) {
			if (!entry.interactionId) continue;

			// entry.renderTime = entry.startTime + entry.duration;

			worst_inp = Math.max(entry.duration, worst_inp);
			const value = entry.duration;

			callback({
				attribution: {
					eventEntry: entry,
					eventTarget: "",
					eventTime: entry.startTime,
					eventType: entry.name,
					loadState: "unknown",
				},
				delta: worst_inp - value,
				entries: [entry],
				id: "none",
				name: "INP",
				navigationType: "unknown",
				rating: valueToRating(value),
				value,
			});
		}
	});
	
	observer.observe({
		type: "event",
		durationThreshold: 0,
		buffered: true
	});
}