import { DateTime, DurationLikeObject } from 'luxon';
import {
	Caches,
	ParseResult,
	parse,
	isEvent,
	toDateRange,
} from '@markwhen/parser';

type RecurrenceUnit =
	| 'seconds'
	| 'minutes'
	| 'hours'
	| 'days'
	| 'weeks'
	| 'months'
	| 'years';

interface ParsedRecurrence {
	interval: number;
	unit: RecurrenceUnit;
	count?: number;
	untilDuration?: DurationLikeObject;
}

const normalizeUnit = (rawUnit: string): RecurrenceUnit | undefined => {
	const token = rawUnit.trim().toLowerCase();
	if (['second', 'seconds', 'sec', 'secs'].includes(token)) return 'seconds';
	if (['minute', 'minutes', 'min', 'mins'].includes(token)) return 'minutes';
	if (['hour', 'hours', 'hr', 'hrs'].includes(token)) return 'hours';
	if (
		[
			'day',
			'days',
			'weekday',
			'weekdays',
			'workday',
			'workdays',
			'business day',
			'business days',
		].includes(token)
	)
		return 'days';
	if (['week', 'weeks'].includes(token)) return 'weeks';
	if (['month', 'months'].includes(token)) return 'months';
	if (['year', 'years'].includes(token)) return 'years';
	return undefined;
};

const parseInterval = (intervalPart: string) => {
	const trimmed = intervalPart.trim().toLowerCase();
	const otherMatch = trimmed.match(/^other\s+(.+)$/);
	if (otherMatch) {
		const unit = normalizeUnit(otherMatch[1]);
		if (!unit) return;
		return { interval: 2, unit };
	}

	const numericMatch = trimmed.match(/^(\d+)\s+(.+)$/);
	if (numericMatch) {
		const unit = normalizeUnit(numericMatch[2]);
		if (!unit) return;
		return { interval: parseInt(numericMatch[1], 10), unit };
	}

	const unit = normalizeUnit(trimmed);
	if (!unit) return;
	return { interval: 1, unit };
};

const parseForLimit = (forPart: string) => {
	const trimmed = forPart.trim().toLowerCase();
	const countMatch = trimmed.match(/^(\d+)\s+times?$/);
	if (countMatch) {
		return { count: parseInt(countMatch[1], 10) };
	}

	const durationMatch = trimmed.match(/^(\d+)\s+(.+)$/);
	if (!durationMatch) return;
	const unit = normalizeUnit(durationMatch[2]);
	if (!unit) return;
	const amount = parseInt(durationMatch[1], 10);
	return { untilDuration: { [unit]: amount } as DurationLikeObject };
};

const parseRecurrence = (recurrencePart: string): ParsedRecurrence | undefined => {
	let working = recurrencePart.trim();
	let count: number | undefined;
	let untilDuration: DurationLikeObject | undefined;

	const xCountMatch = working.match(/\bx\s*(\d+)\s*$/i);
	if (xCountMatch) {
		count = parseInt(xCountMatch[1], 10);
		working = working.slice(0, xCountMatch.index).trim();
	}

	const forMatch = working.match(/\bfor\s+(.+)$/i);
	if (forMatch) {
		const forLimit = parseForLimit(forMatch[1]);
		if (!forLimit) return;
		count = forLimit.count ?? count;
		untilDuration = forLimit.untilDuration ?? untilDuration;
		working = working.slice(0, forMatch.index).trim();
	}

	const interval = parseInterval(working);
	if (!interval) return;

	return {
		...interval,
		count,
		untilDuration,
	};
};

const formatRange = (from: DateTime, to: DateTime) => {
	const dayEvent =
		from.hour === 0 &&
		from.minute === 0 &&
		from.second === 0 &&
		to.diff(from, 'days').days === 1 &&
		to.hour === 0 &&
		to.minute === 0 &&
		to.second === 0;
	if (dayEvent) {
		return from.toISODate() ?? from.toISO();
	}

	const formatDateTime = (dateTime: DateTime) => {
		if (dateTime.second === 0 && dateTime.millisecond === 0) {
			return dateTime.toFormat('yyyy-MM-dd HH:mm');
		}
		return dateTime.toFormat('yyyy-MM-dd HH:mm:ss');
	};

	return `${formatDateTime(from)}/${formatDateTime(to)}`;
};

const expandRecurringLine = (line: string): string[] | undefined => {
	const match = line.match(/^(\s*)(.+?)\s+every\s+(.+?)\s*:\s*(.*)$/i);
	if (!match) {
		return;
	}

	const [, indent, datePart, recurrencePart, description] = match;
	const recurrence = parseRecurrence(recurrencePart);
	if (!recurrence) {
		return;
	}

	const seed = parse(`${datePart}: seed`);
	const first = seed.events?.children?.[0];
	if (!first || !isEvent(first)) {
		return;
	}

	const baseRange = toDateRange(first.dateRangeIso);
	const until = recurrence.untilDuration
		? baseRange.fromDateTime.plus(recurrence.untilDuration)
		: undefined;

	const expanded: string[] = [];
	let from = baseRange.fromDateTime;
	// When the seed is a zero-duration point event (e.g. "9am"), give each
	// occurrence a duration equal to one interval so events have visible width.
	let to =
		baseRange.toDateTime.toMillis() === from.toMillis()
			? from.plus({ [recurrence.unit]: recurrence.interval })
			: baseRange.toDateTime;

	for (let i = 0; i < 500; i++) {
		if (recurrence.count !== undefined && i >= recurrence.count) {
			break;
		}
		if (until && from >= until) {
			break;
		}

		expanded.push(`${indent}${formatRange(from, to)}: ${description}`);

		from = from.plus({ [recurrence.unit]: recurrence.interval });
		to = to.plus({ [recurrence.unit]: recurrence.interval });
	}

	if (!expanded.length) {
		return;
	}

	return expanded;
};

const expandRecurringEvents = (rawTimelineString: string) => {
	const lines = rawTimelineString.split('\n');
	const expandedLines: string[] = [];
	for (const line of lines) {
		const expanded = expandRecurringLine(line);
		if (!expanded) {
			expandedLines.push(line);
			continue;
		}
		expandedLines.push(...expanded);
	}
	return expandedLines.join('\n');
};

export const parseWithEnhancements = (
	rawTimelineString: string,
	cache?: Caches
): ParseResult => {
	const expanded = expandRecurringEvents(rawTimelineString);
	return parse(expanded, cache);
};
