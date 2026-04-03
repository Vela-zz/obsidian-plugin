import { Caches } from '@markwhen/parser';
import { parseWithEnhancements } from './utils/parseWithEnhancements';

const cache = new Caches();
addEventListener('message', (message) => {
	try {
		// Keep the payload shape expected by the editor-side worker consumer.
		postMessage({
			timelines: parseWithEnhancements(
				message.data.rawTimelineString,
				cache
			),
		});
	} catch (e) {
		postMessage({ error: e });
	}
});
