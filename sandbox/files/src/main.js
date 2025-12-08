import { mount, unmount } from 'svelte';

const playerId = window.PLAYER_ID || 'default';
const target = document.getElementById('app');
let currentApp = null;

async function loadSolution() {
	try {
		const mod = await import(`./solutions/${playerId}.svelte`);

		if (currentApp) {
			unmount(currentApp);
		}
		currentApp = mount(mod.default, { target });
	} catch {
		// File doesn't exist yet
		target.innerHTML = '<div style="padding:20px;color:#666">Waiting for code...</div>';
	}
}

loadSolution();

// Vite/Svelte HMR will handle component updates automatically
// For dynamic imports, we need to listen for the full-reload fallback
if (import.meta.hot) {
	import.meta.hot.accept(() => {
		loadSolution();
	});
}
