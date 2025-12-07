/**
 * Test cleanup endpoint.
 * Kills all active E2B sandboxes to prevent resource leaks during testing.
 * Only available in development mode.
 */
import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { SandboxManager } from '$lib/server/e2b';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	// Only allow in development mode for safety
	if (!dev) {
		error(403, 'Test cleanup endpoint is only available in development mode');
	}

	const activeBefore = SandboxManager.getActiveCount();
	const killed = await SandboxManager.killAll();

	return json({
		success: true,
		sandboxesKilled: killed,
		activeBeforeCleanup: activeBefore
	});
};

export const GET: RequestHandler = async () => {
	// Only allow in development mode for safety
	if (!dev) {
		error(403, 'Test cleanup endpoint is only available in development mode');
	}

	return json({
		activeSandboxes: SandboxManager.getActiveCount()
	});
};
