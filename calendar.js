import { getAccessToken } from './oauth.js';

export async function fetchUpcomingEvents(hoursAhead = 8) {
	const token = await getAccessToken({ interactive: false });
	const now = new Date();
	const timeMin = now.toISOString();
	const timeMax = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();
	const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
	url.searchParams.set('singleEvents', 'true');
	url.searchParams.set('orderBy', 'startTime');
	url.searchParams.set('timeMin', timeMin);
	url.searchParams.set('timeMax', timeMax);
	url.searchParams.set('maxResults', '50');
	const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error('Failed to fetch events');
	const json = await res.json();
	const events = (json.items || []).map(e => normalizeEvent(e)).filter(Boolean);
	return events;
}

function normalizeEvent(e) {
	const startIso = e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
	if (!startIso) return null;
	return {
		id: e.id,
		summary: e.summary || 'Calendar event',
		start: new Date(startIso).getTime(),
		htmlLink: e.htmlLink || ''
	};
}

export async function scheduleEventAlarms(events) {
	const alarms = await chrome.alarms.getAll();
	await Promise.all(alarms.filter(a => a.name.startsWith('event-')).map(a => chrome.alarms.clear(a.name)));
	const now = Date.now();
	for (const ev of events) {
		const triggerTime = ev.start - 60_000;
		if (triggerTime > now) {
			await chrome.alarms.create(`event-${ev.id}-${triggerTime}`, { when: triggerTime });
		}
	}
}
