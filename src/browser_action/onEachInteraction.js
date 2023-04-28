export function onEachInteraction(callback) {
	const valueToRating = score => score <= 200 ? 'good' : score <= 500 ? 'needs-improvement' : 'poor';
	
	const observer = new PerformanceObserver(list => {
		const interactions = {};

		for (let entry of list.getEntries().filter(entry => entry.interactionId)) {
			interactions[entry.interactionId] = interactions[entry.interactionId] || [];
			interactions[entry.interactionId].push(entry);
		}

		// Will report as a single interaction even if parts are in separate frames.
		// Consider splitting by animation frame.
		for (let interaction of Object.values(interactions)) {
			const entry = interaction.reduce((prev, curr) => prev.duration >= curr.duration ? prev : curr);
			const value = entry.duration;

			callback({
				attribution: {
					eventEntry: entry,
					eventTarget: "",
					eventTime: entry.startTime,
					eventType: entry.name,
					loadState: "unknown",
				},
				delta: 0,
				entries: interaction,
				id: "none",
				name: "Interaction",
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