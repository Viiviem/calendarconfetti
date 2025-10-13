const OVERLAY_ID = '__calendar_confetti_overlay__';

function ensureStylesInjected() {
	if (document.getElementById('__calendar_confetti_styles__')) return;
	const style = document.createElement('style');
	style.id = '__calendar_confetti_styles__';
	style.textContent = `
		@keyframes confetti-fall { 0% { transform: translateY(-100vh) rotate(0deg); } 100% { transform: translateY(100vh) rotate(720deg); } }
		#${OVERLAY_ID} { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: flex; align-items: center; justify-content: center; }
		#${OVERLAY_ID}.hidden { display: none; }
		#${OVERLAY_ID} .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.15); }
		#${OVERLAY_ID} .banner { position: relative; background: #111827; color: #fff; border-radius: 12px; padding: 16px 20px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 10px; }
		#${OVERLAY_ID} .gif { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; }
		#${OVERLAY_ID} .confetti { position: absolute; left: 0; top: -10vh; width: 100%; height: 0; overflow: visible; }
		#${OVERLAY_ID} .piece { position: absolute; top: -10vh; font-size: 18px; animation: confetti-fall linear forwards; }
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
		root.innerHTML = `
			<div class="backdrop"></div>
			<div class="banner"><span class="text">Your event starts in 1 minute 🎉</span></div>
			<div class="confetti"></div>
		`;
		document.documentElement.appendChild(root);
	}
	root.classList.remove('hidden');
	maybeAddGif(root.querySelector('.banner'));
	spawnConfetti(root.querySelector('.confetti'));
	setTimeout(() => root.classList.add('hidden'), 5000);
}

function maybeAddGif(bannerEl) {
	try {
		const url = chrome.runtime.getURL('assets/confetti_gif.gif');
		const img = new Image();
		img.className = 'gif';
		img.onload = () => {
			if (!bannerEl.querySelector('img.gif')) bannerEl.prepend(img);
		};
		img.onerror = () => {};
		img.src = url;
	} catch (_) {}
}

function spawnConfetti(container) {
	if (!container) return;
	container.textContent = '';
	const emojis = ['🎉','🎊','💥','✨','🎈','🥳','💫'];
	const count = 80;
	for (let i = 0; i < count; i++) {
		const span = document.createElement('span');
		span.className = 'piece';
		span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
		span.style.left = Math.random() * 100 + 'vw';
		span.style.animationDuration = 2 + Math.random() * 2 + 's';
		span.style.animationDelay = Math.random() * 0.5 + 's';
		container.appendChild(span);
	}
}

chrome.runtime.onMessage.addListener((message) => {
	if (message?.type === 'show-confetti') {
		showOverlay();
	}
});
