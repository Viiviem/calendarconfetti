const OVERLAY_ID = '__calendar_confetti_overlay__';
const STYLE_ID = '__calendar_confetti_styles__';

function ensureStylesInjected() {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
		@keyframes confetti-fall {
			0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
			100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
		}
		#${OVERLAY_ID} {
			position: fixed; inset: 0; z-index: 2147483647;
			pointer-events: none;
			display: flex; align-items: center; justify-content: center;
		}
		#${OVERLAY_ID}.hidden { display: none; }
		#${OVERLAY_ID} .backdrop {
			position: absolute; inset: 0; background: rgba(0,0,0,0.15);
		}
		#${OVERLAY_ID} .banner {
			position: relative; background: #111827; color: #fff;
			border-radius: 12px; padding: 16px 20px;
			font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
			font-size: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.25);
			display: flex; align-items: center; gap: 10px;
			pointer-events: auto;
		}
		#${OVERLAY_ID} .banner .title {
			font-size: 13px; font-weight: 600; opacity: 0.8; margin-bottom: 2px;
		}
		#${OVERLAY_ID} .gif {
			width: 40px; height: 40px; border-radius: 6px; object-fit: cover;
		}
		#${OVERLAY_ID} .dismiss {
			background: none; border: none; color: #9ca3af; cursor: pointer;
			font-size: 18px; line-height: 1; padding: 0 0 0 8px; pointer-events: auto;
		}
		#${OVERLAY_ID} .dismiss:hover { color: #fff; }
		#${OVERLAY_ID} .confetti {
			position: absolute; left: 0; top: 0; width: 100%; height: 100%;
			overflow: hidden; pointer-events: none;
		}
		#${OVERLAY_ID} .piece {
			position: absolute; top: -5vh; font-size: 18px;
			animation: confetti-fall linear forwards;
		}
	`;
	document.documentElement.appendChild(style);
}

function showOverlay() {
	ensureStylesInjected();

	let root = document.getElementById(OVERLAY_ID);
	if (!root) {
		root = document.createElement('div');
		root.id = OVERLAY_ID;
		root.className = 'hidden';

		const backdrop = document.createElement('div');
		backdrop.className = 'backdrop';

		const banner = document.createElement('div');
		banner.className = 'banner';

		const text = document.createElement('span');
		text.textContent = 'Your event starts in 1 minute 🎉';

		const dismiss = document.createElement('button');
		dismiss.className = 'dismiss';
		dismiss.setAttribute('aria-label', 'Dismiss');
		dismiss.textContent = '✕';
		dismiss.addEventListener('click', () => root.classList.add('hidden'));

		banner.append(text, dismiss);

		const confetti = document.createElement('div');
		confetti.className = 'confetti';

		root.append(backdrop, banner, confetti);
		document.documentElement.appendChild(root);
	}

	root.classList.remove('hidden');
	maybeAddGif(root.querySelector('.banner'));
	spawnConfetti(root.querySelector('.confetti'));

	// Auto-dismiss after 8 seconds
	setTimeout(() => root.classList.add('hidden'), 8000);
}

function maybeAddGif(bannerEl) {
	if (!bannerEl || bannerEl.querySelector('img.gif')) return;
	try {
		const url = chrome.runtime.getURL('assets/confetti_gif.gif');
		const img = new Image();
		img.className = 'gif';
		img.alt = '';
		img.onload = () => bannerEl.prepend(img);
		img.src = url;
	} catch (_) {}
}

function spawnConfetti(container) {
	if (!container) return;
	container.textContent = '';
	const emojis = ['🎉', '🎊', '💥', '✨', '🎈', '🥳', '💫'];
	// 50 pieces balances visual impact with performance on lower-end devices
	for (let i = 0; i < 50; i++) {
		const span = document.createElement('span');
		span.className = 'piece';
		span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
		span.style.left = `${Math.random() * 100}vw`;
		span.style.animationDuration = `${2 + Math.random() * 2}s`;
		span.style.animationDelay = `${Math.random() * 0.8}s`;
		container.appendChild(span);
	}
}

chrome.runtime.onMessage.addListener((message) => {
	if (message?.type === 'show-confetti') {
		showOverlay();
	}
});
