import { getAccessToken } from './oauth.js';

// Request only the fields we actually use to minimise data transferred and stored.
const EVENT_FIELDS = 'items(id,summary,start)';

export async function fetchUpcomingEvents(hoursAhead = 8) {
	const token = await getAccessToken({ interactive: false });
	const now = new Date();
	const timeMax = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();

	const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
	url.searchParams.set('singleEvents', 'true');
	url.searchParams.set('orderBy', 'startTime');
	url.searchParams.set('timeMin', now.toISOString());
	url.searchParams.set('timeMax', timeMax);
	url.searchParams.set('maxResults', '50');
	url.searchParams.set('showDeleted', 'false');
	url.searchParams.set('fields', EVENT_FIELDS);

	const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
	const json = await res.json();
	return (json.items || []).map(normalizeEvent).filter(Boolean);
}

function normalizeEvent(e) {
	const startIso = e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
	if (!startIso) return null;
	return {
		id: e.id,
		summary: e.summary || 'Calendar event',
		start: new Date(startIso).getTime()
	};
}

export async function scheduleEventAlarms(events) {
	// Clear all existing event alarms before rescheduling
	const existing = await chrome.alarms.getAll();
	await Promise.all(
		existing.filter(a => a.name.startsWith('event-')).map(a => chrome.alarms.clear(a.name))
	);

	const now = Date.now();
	for (const ev of events) {
		const triggerAt = ev.start - 60_000; // one minute before
		if (triggerAt > now) {
			await chrome.alarms.create(`event-${ev.id}`, { when: triggerAt });
		}
	}
}
