import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'html',
	// Increased timeout for sandbox-dependent tests
	timeout: 120000,
	// Use single worker to avoid E2B rate limits (shared sandbox tests need this)
	workers: 1,

	// Clean up E2B sandboxes after all tests complete
	globalTeardown: './tests/e2e/global-teardown.ts',

	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]

	// Servers are started by the npm scripts using concurrently + wait-on
});
