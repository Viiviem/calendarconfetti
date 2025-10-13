# Calendar Confetti (Chrome MV3)

Shows a celebratory overlay one minute before your next Google Calendar event.

## Setup

1. Create an OAuth 2.0 Client ID (Web application) in Google Cloud Console.
   - Authorized redirect URI: `https://<extension-id>.chromiumapp.org/`
   - During development, use `chrome.identity.getRedirectURL()`; the exact value will be allowed automatically by Google for extensions using `launchWebAuthFlow`.
2. Copy the Client ID.
3. Load the extension:
   - Chrome → Extensions → Developer mode → Load unpacked
   - Select this folder.
4. Click the extension icon → set your Client ID in the popup, then Sign in.
5. Click "Refresh events" to schedule alarms. The overlay will appear on any tab one minute before events.

## Notes
- Requires Chrome 114+.
- Uses `chrome.identity.launchWebAuthFlow` with PKCE, storing tokens in `chrome.storage.local`.
- Scopes: `calendar.readonly` plus basic OpenID scopes.

## Dev tips
- Use the popup "Test overlay" to verify content script messaging.
- To reset auth, click "Sign out" in the popup.
