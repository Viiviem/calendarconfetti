// Minimal OAuth2 with PKCE using chrome.identity.launchWebAuthFlow

// Access token lives in session storage — cleared when the browser closes.
// Refresh token lives in local storage — persisted so the user stays logged in
// across browser restarts without needing to re-authenticate interactively.
const ACCESS_TOKEN_KEY = 'oauth_token';
const EXPIRY_KEY = 'oauth_expiry';
const REFRESH_TOKEN_KEY = 'oauth_refresh_token';

// Minimal scope: read-only calendar access only.
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

export async function getAccessTokenInteractive() {
	const { codeVerifier, codeChallenge } = await generateCodeVerifierAndChallenge();
	const state = generateState();
	const clientId = await getClientId();
	const redirectUri = chrome.identity.getRedirectURL();

	const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', SCOPES.join(' '));
	authUrl.searchParams.set('access_type', 'offline');
	authUrl.searchParams.set('code_challenge', codeChallenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	authUrl.searchParams.set('state', state);

	const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
	if (!responseUrl) throw new Error('Authorization was cancelled or failed');

	const url = new URL(responseUrl);

	// Verify state parameter to prevent CSRF attacks
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

	// Short-lived access token: session storage only (not persisted to disk)
	await chrome.storage.session.set({ [ACCESS_TOKEN_KEY]: tokenJson.access_token, [EXPIRY_KEY]: expiry });

	// Long-lived refresh token: local storage so user survives browser restarts
	if (tokenJson.refresh_token) {
		await chrome.storage.local.set({ [REFRESH_TOKEN_KEY]: tokenJson.refresh_token });
	}

	return tokenJson.access_token;
}

export async function getAccessToken({ interactive = false } = {}) {
	const { [ACCESS_TOKEN_KEY]: token, [EXPIRY_KEY]: expiry } = await chrome.storage.session.get({
		[ACCESS_TOKEN_KEY]: '',
		[EXPIRY_KEY]: 0
	});
	if (token && Date.now() < expiry - 60_000) return token;

	// Try silent refresh using the persisted refresh token
	const { [REFRESH_TOKEN_KEY]: refreshToken } = await chrome.storage.local.get({ [REFRESH_TOKEN_KEY]: '' });
	if (refreshToken) {
		try {
			const clientId = await getClientId();
			const res = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					client_id: clientId,
					grant_type: 'refresh_token',
					refresh_token: refreshToken
				}).toString()
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error_description || json.error || 'Refresh failed');
			const newExpiry = Date.now() + (json.expires_in || 3600) * 1000;
			await chrome.storage.session.set({ [ACCESS_TOKEN_KEY]: json.access_token, [EXPIRY_KEY]: newExpiry });
			return json.access_token;
		} catch (e) {
			console.warn('Token refresh failed:', e.message);
		}
	}

	if (interactive) return getAccessTokenInteractive();
	throw new Error('Not authenticated');
}

export async function signOut() {
	await Promise.all([
		chrome.storage.session.remove([ACCESS_TOKEN_KEY, EXPIRY_KEY]),
		chrome.storage.local.remove([REFRESH_TOKEN_KEY])
	]);
}

export async function setClientId(clientId) {
	await chrome.storage.local.set({ clientId });
}

export async function getClientIdStored() {
	const { clientId } = await chrome.storage.local.get({ clientId: '' });
	return clientId;
}
