import { getAccessToken, isAuthenticated } from './oauth.js';
import { fetchUpcomingEvents, scheduleEventAlarms } from './calendar.js';

const FETCH_INTERVAL_MIN = 15; // refresh events every 15 minutes

async function ensureScheduled() {
	try {
		if (!(await isAuthenticated())) return;
		const events = await fetchUpcomingEvents(8);
		await scheduleEventAlarms(events);
	} catch (e) {
		console.warn('Scheduling failed', e);
	}
}

chrome.runtime.onInstalled.addListener(async () => {
	chrome.alarms.create('refresh-events', { periodInMinutes: FETCH_INTERVAL_MIN, when: Date.now() + 3000 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === 'refresh-events') {
		await ensureScheduled();
		return;
	}
	if (alarm.name.startsWith('event-')) {
		// Broadcast to all tabs to show overlay
		try {
			const tabs = await chrome.tabs.query({});
			for (const tab of tabs) {
				if (tab.id != null) {
					await chrome.tabs.sendMessage(tab.id, { type: 'show-confetti' });
				}
			}
		} catch (e) {
			console.warn('Failed to send message to tabs', e);
		}
	}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === 'trigger-fetch-now') {
		ensureScheduled().then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: String(err) }));
		return true; // async
	}
});
