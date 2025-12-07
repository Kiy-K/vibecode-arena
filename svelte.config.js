import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV !== 'production';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		experimental: {
			remoteFunctions: true
		},
		// Disable service worker in development
		serviceWorker: {
			register: !dev
		}
	},

	compilerOptions: {
		experimental: {
			async: true
		}
	}
};

export default config;
