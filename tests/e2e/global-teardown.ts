/**
 * Global teardown for Playwright tests.
 * Cleans up all E2B sandboxes after tests complete.
 */

async function globalTeardown() {
	// Skip teardown for quick tests (no sandboxes to clean up)
	if (process.env.E2E_SKIP_SANDBOX === 'true') {
		return;
	}

	const baseUrl = process.env.BASE_URL || 'http://localhost:5173';

	console.log('[Teardown] Cleaning up E2B sandboxes...');

	try {
		const response = await fetch(`${baseUrl}/api/test-cleanup`, {
			method: 'POST'
		});

		if (response.ok) {
			const result = await response.json();
			console.log(`[Teardown] Killed ${result.sandboxesKilled} sandbox(es)`);
		} else {
			console.warn(`[Teardown] Cleanup endpoint returned ${response.status}`);
		}
	} catch {
		// Server might already be shut down, which is fine
		console.warn('[Teardown] Could not reach cleanup endpoint (server may be stopped)');
	}
}

export default globalTeardown;
