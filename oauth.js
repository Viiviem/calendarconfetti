// Minimal OAuth2 with PKCE using chrome.identity.launchWebAuthFlow

const TOKEN_KEY = 'oauth_token';
const REFRESH_TOKEN_KEY = 'oauth_refresh_token';
const EXPIRY_KEY = 'oauth_expiry';
const SCOPES = [
	'https://www.googleapis.com/auth/calendar.readonly',
	'openid',
	'email',
	'profile'
];

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
	const data = encoder.encode(codeVerifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	const codeChallenge = uint8ArrayToBase64Url(new Uint8Array(digest));
	return { codeVerifier, codeChallenge };
}

async function getClientId() {
	const { clientId } = await chrome.storage.local.get({ clientId: '' });
	if (!clientId) throw new Error('Google OAuth Client ID not set. Use popup to configure.');
	return clientId;
}

export async function isAuthenticated() {
	const { [TOKEN_KEY]: token, [EXPIRY_KEY]: expiry } = await chrome.storage.local.get({ [TOKEN_KEY]: '', [EXPIRY_KEY]: 0 });
	if (!token) return false;
	return Date.now() < expiry - 60_000;
}

export async function getAccessTokenInteractive() {
	const { codeVerifier, codeChallenge } = await generateCodeVerifierAndChallenge();
	const clientId = await getClientId();
	const redirectUri = chrome.identity.getRedirectURL();
	const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', SCOPES.join(' '));
	authUrl.searchParams.set('prompt', 'consent');
	authUrl.searchParams.set('access_type', 'offline');
	authUrl.searchParams.set('include_granted_scopes', 'true');
	authUrl.searchParams.set('code_challenge', codeChallenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');

	const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
	const url = new URL(responseUrl);
	const code = url.searchParams.get('code');
	if (!code) throw new Error('Authorization code not found');

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
	if (!tokenResponse.ok) throw new Error(tokenJson.error_description || 'Token exchange failed');

	const now = Date.now();
	const expiry = now + (tokenJson.expires_in || 3600) * 1000;
	await chrome.storage.local.set({
		[TOKEN_KEY]: tokenJson.access_token,
		[REFRESH_TOKEN_KEY]: tokenJson.refresh_token || '',
		[EXPIRY_KEY]: expiry
	});
	return tokenJson.access_token;
}

export async function getAccessToken({ interactive = false } = {}) {
	const { [TOKEN_KEY]: token, [EXPIRY_KEY]: expiry, [REFRESH_TOKEN_KEY]: refreshToken } = await chrome.storage.local.get({ [TOKEN_KEY]: '', [EXPIRY_KEY]: 0, [REFRESH_TOKEN_KEY]: '' });
	if (token && Date.now() < expiry - 60_000) return token;
	if (refreshToken) {
		try {
			const clientId = await getClientId();
			const params = new URLSearchParams({
				client_id: clientId,
				grant_type: 'refresh_token',
				refresh_token: refreshToken
			});
			const res = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || 'Refresh failed');
			const newExpiry = Date.now() + (json.expires_in || 3600) * 1000;
			await chrome.storage.local.set({ [TOKEN_KEY]: json.access_token, [EXPIRY_KEY]: newExpiry });
			return json.access_token;
		} catch (e) {}
	}
	if (interactive) return getAccessTokenInteractive();
	throw new Error('Not authenticated');
}

export async function signOut() {
	await chrome.storage.local.remove([TOKEN_KEY, REFRESH_TOKEN_KEY, EXPIRY_KEY]);
}

export async function setClientId(clientId) {
	await chrome.storage.local.set({ clientId });
}

export async function getClientIdStored() {
	const { clientId } = await chrome.storage.local.get({ clientId: '' });
	return clientId;
}
