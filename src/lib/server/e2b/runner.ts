/**
 * E2B sandbox runner service.
 * Handles sandbox setup, code execution, and server management.
 */
import type { Sandbox } from 'e2b';
import { createLogger } from '../logger';
import { roomEvents } from '../events';
import { SandboxManager } from './SandboxManager';
import {
	SERVER_STARTUP_MAX_POLLS,
	SERVER_POLL_INTERVAL_MS,
	SERVER_CHECK_TIMEOUT_MS,
	HMR_DELAY_MS,
	APP_DIR
} from './config';

const log = createLogger('SandboxRunner');

/**
 * Start sandbox for a room.
 * Creates the sandbox and ensures Vite dev server is running.
 */
export async function startRoomSandbox(roomId: string): Promise<void> {
	const emitLog = (msg: string) => {
		log.info(msg, { roomId });
		roomEvents.emit(roomId, 'sandbox_log', { message: msg });
	};

	emitLog('Creating sandbox...');

	try {
		const sandbox = await SandboxManager.getOrCreate(roomId);
		emitLog('Sandbox created, starting server...');
		await ensureServerRunning(sandbox, emitLog);
		SandboxManager.markReady(roomId);
		emitLog('Sandbox is ready!');
	} catch (error) {
		log.error('Sandbox setup failed', { roomId, error: String(error) });
		emitLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		throw error;
	}
}

/**
 * Ensure Vite dev server is running in the sandbox.
 * Starts it if not running and polls until ready.
 */
async function ensureServerRunning(
	sandbox: Sandbox,
	emitLog: (msg: string) => void
): Promise<void> {
	// Check if already running
	try {
		const check = await sandbox.commands.run(
			'curl -s http://localhost:3000 > /dev/null && echo "running"',
			{ timeoutMs: 2000 }
		);
		if (check.stdout.includes('running')) {
			emitLog('Server already running');
			return;
		}
	} catch {
		// Not running, continue to start it
	}

	emitLog('Starting Vite server...');

	// Start Vite in background
	sandbox.commands.run(`cd ${APP_DIR} && npm run dev > /tmp/vite.log 2>&1`, {
		timeoutMs: 0,
		background: true
	});

	// Poll for server readiness
	for (let i = 0; i < SERVER_STARTUP_MAX_POLLS; i++) {
		await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS));
		try {
			const result = await sandbox.commands.run(
				'curl -s http://localhost:3000 > /dev/null && echo "ready"',
				{ timeoutMs: SERVER_CHECK_TIMEOUT_MS }
			);
			if (result.stdout.includes('ready')) {
				emitLog('Server ready');
				return;
			}
		} catch {
			// Not ready yet, keep polling
		}
	}

	throw new Error('Server failed to start');
}

/**
 * Preview code in sandbox without scoring.
 * Writes player's code to their solution file for live preview.
 */
export async function previewCode(
	code: string,
	playerId: string,
	roomId: string
): Promise<{ sandboxUrl: string }> {
	await SandboxManager.updatePlayerCode(roomId, playerId, code);
	const sandboxUrl = SandboxManager.getPlayerUrl(roomId, playerId);
	return { sandboxUrl: `${sandboxUrl}&t=${Date.now()}` };
}

/**
 * Wait for HMR to update.
 * Used after writing code to sandbox before evaluating.
 */
export async function waitForHMR(): Promise<void> {
	await new Promise((r) => setTimeout(r, HMR_DELAY_MS));
}
