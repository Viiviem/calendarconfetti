import { getAccessTokenInteractive, signOut, getClientIdStored, setClientId, isAuthenticated } from './oauth.js';

const statusEl = document.getElementById('status');

function setStatus(msg, isError = false) {
	statusEl.textContent = msg;
	statusEl.classList.toggle('error', isError);
}

async function init() {
	document.getElementById('clientId').value = await getClientIdStored() || '';
	const authed = await isAuthenticated();
	setStatus(authed ? 'Signed in' : 'Not signed in');
}

document.getElementById('save').addEventListener('click', async () => {
	const cid = document.getElementById('clientId').value.trim();
	if (!cid) { setStatus('Please enter a Client ID', true); return; }
	await setClientId(cid);
	setStatus('Client ID saved');
});

document.getElementById('signin').addEventListener('click', async () => {
	try {
		await getAccessTokenInteractive();
		setStatus('Signed in');
	} catch (e) {
		setStatus('Sign in failed: ' + e.message, true);
	}
});

document.getElementById('signout').addEventListener('click', async () => {
	await signOut();
	setStatus('Signed out');
});

document.getElementById('test').addEventListener('click', async () => {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (tab?.id != null) {
		try {
			await chrome.tabs.sendMessage(tab.id, { type: 'show-confetti' });
		} catch (e) {
			setStatus('Cannot show overlay on this page', true);
		}
	}
});

document.getElementById('refresh').addEventListener('click', async () => {
	const result = await chrome.runtime.sendMessage({ type: 'trigger-fetch-now' });
	setStatus(result?.ok ? 'Events refreshed' : `Refresh failed: ${result?.error || 'unknown'}`, !result?.ok);
});

init();
