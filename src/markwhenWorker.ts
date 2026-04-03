import { Caches } from '@markwhen/parser';
import { parseWithEnhancements } from './utils/parseWithEnhancements';

const cache = new Caches();
addEventListener('message', (message) => {
	try {
		postMessage(parseWithEnhancements(message.data.rawTimelineString, cache));
	} catch (e) {
		postMessage({ error: e });
	}
});
