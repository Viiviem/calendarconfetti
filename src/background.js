import { isAuthenticated } from './oauth.js';
import { fetchUpcomingEvents, scheduleEventAlarms } from './calendar.js';

const FETCH_INTERVAL_MIN = 15;
const REFRESH_ALARM = 'refresh-events';

async function ensureScheduled() {
	try {
		if (!(await isAuthenticated())) return;
		const events = await fetchUpcomingEvents(8);
		await scheduleEventAlarms(events);
	} catch (e) {
		console.warn('Scheduling failed:', e.message);
	}
}

// Set up the recurring refresh alarm on first install or extension update.
chrome.runtime.onInstalled.addListener(async () => {
	// Clear any stale alarm from a previous install before creating a fresh one
	await chrome.alarms.clear(REFRESH_ALARM);
	chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: FETCH_INTERVAL_MIN, when: Date.now() + 3000 });
});

// Re-schedule when Chrome starts (alarms persist but tokens in session storage
// are cleared on browser restart — this triggers a silent refresh if possible).
chrome.runtime.onStartup.addListener(() => ensureScheduled());

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === REFRESH_ALARM) {
		await ensureScheduled();
		return;
	}
	if (alarm.name.startsWith('event-')) {
		const tabs = await chrome.tabs.query({});
		// Fire-and-forget to each tab; failures are expected for non-content-script tabs
		await Promise.allSettled(
			tabs
				.filter(tab => tab.id != null)
				.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'show-confetti' }))
		);
	}
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type === 'trigger-fetch-now') {
		ensureScheduled()
			.then(() => sendResponse({ ok: true }))
			.catch(err => sendResponse({ ok: false, error: String(err) }));
		return true; // keep channel open for async response
	}
});
