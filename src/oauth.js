// Minimal OAuth2 with PKCE using chrome.identity.launchWebAuthFlow.
//
// Tokens live only in chrome.storage.session (cleared on browser close).
// We do NOT persist a refresh token to disk: when the access token expires we
// re-run launchWebAuthFlow with interactive=false, which silently completes if
// Google still has a session for this user and the scopes were already granted.

const ACCESS_TOKEN_KEY = 'oauth_token';
const EXPIRY_KEY = 'oauth_expiry';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

function uint8ArrayToBase64Url(uint8Array) {
	let binary = '';
	for (let i = 0; i < uint8Array.byteLength; i++) {
		binary += String.fromCharCode(uint8Array[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeVerifierAndChallenge() {
	const random = crypto.getRandomValues(new Uint8Array(32));
	const codeVerifier = uint8ArrayToBase64Url(random);
	const encoder = new TextEncoder();
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
	const codeChallenge = uint8ArrayToBase64Url(new Uint8Array(digest));
	return { codeVerifier, codeChallenge };
}

function generateState() {
	return uint8ArrayToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

async function getClientId() {
	const { clientId } = await chrome.storage.local.get({ clientId: '' });
	if (!clientId) throw new Error('Google OAuth Client ID not set. Use popup to configure.');
	return clientId;
}

export async function isAuthenticated() {
	const { [ACCESS_TOKEN_KEY]: token, [EXPIRY_KEY]: expiry } = await chrome.storage.session.get({
		[ACCESS_TOKEN_KEY]: '',
		[EXPIRY_KEY]: 0
	});
	if (!token) return false;
	return Date.now() < expiry - 60_000;
}

// Coalesce concurrent auth attempts so two callers (e.g. background scheduler
// and the popup) hitting an expired token share a single network round-trip.
let inflightAuth = null;

async function runAuthFlow(interactive) {
	const { codeVerifier, codeChallenge } = await generateCodeVerifierAndChallenge();
	const state = generateState();
	const clientId = await getClientId();
	const redirectUri = chrome.identity.getRedirectURL();

	const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', SCOPES.join(' '));
	authUrl.searchParams.set('code_challenge', codeChallenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	authUrl.searchParams.set('state', state);

	const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive });
	if (!responseUrl) throw new Error('Authorization was cancelled or failed');

	const url = new URL(responseUrl);
	if (url.searchParams.get('state') !== state) {
		throw new Error('State mismatch — possible CSRF attack, aborting');
	}

	const code = url.searchParams.get('code');
	if (!code) throw new Error('Authorization code not found in response');

	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			code,
			code_verifier: codeVerifier,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		}).toString()
	});
	const tokenJson = await tokenResponse.json();
	if (!tokenResponse.ok) throw new Error(tokenJson.error_description || tokenJson.error || 'Token exchange failed');

	const expiry = Date.now() + (tokenJson.expires_in || 3600) * 1000;
	await chrome.storage.session.set({ [ACCESS_TOKEN_KEY]: tokenJson.access_token, [EXPIRY_KEY]: expiry });
	return tokenJson.access_token;
}

function authFlow(interactive) {
	if (inflightAuth) return inflightAuth;
	inflightAuth = runAuthFlow(interactive).finally(() => { inflightAuth = null; });
	return inflightAuth;
}

export async function getAccessTokenInteractive() {
	return authFlow(true);
}

export async function getAccessToken({ interactive = false } = {}) {
	const { [ACCESS_TOKEN_KEY]: token, [EXPIRY_KEY]: expiry } = await chrome.storage.session.get({
		[ACCESS_TOKEN_KEY]: '',
		[EXPIRY_KEY]: 0
	});
	if (token && Date.now() < expiry - 60_000) return token;

	try {
		return await authFlow(false);
	} catch (e) {
		if (interactive) return authFlow(true);
		throw new Error('Not authenticated');
	}
}

async function clearEventAlarms() {
	const alarms = await chrome.alarms.getAll();
	await Promise.all(alarms.filter(a => a.name.startsWith('event-')).map(a => chrome.alarms.clear(a.name)));
}

async function revokeToken(token) {
	try {
		await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' });
	} catch (e) {
		console.warn('Token revocation failed:', e.message);
	}
}

export async function signOut() {
	const { [ACCESS_TOKEN_KEY]: token } = await chrome.storage.session.get({ [ACCESS_TOKEN_KEY]: '' });
	await Promise.all([
		chrome.storage.session.remove([ACCESS_TOKEN_KEY, EXPIRY_KEY]),
		clearEventAlarms(),
		token ? revokeToken(token) : Promise.resolve()
	]);
}

export async function setClientId(clientId) {
	await chrome.storage.local.set({ clientId });
}

export async function getClientIdStored() {
	const { clientId } = await chrome.storage.local.get({ clientId: '' });
	return clientId;
}
