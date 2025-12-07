/**
 * E2B Sandbox Manager.
 * Manages sandbox lifecycle, player code, and logging.
 */
import { Sandbox } from 'e2b';
import { env } from '../env';
import { createLogger } from '../logger';
import type { RoomSandbox, LogCallback } from './types';
import {
	TEMPLATE_ID,
	SANDBOX_TIMEOUT_MS,
	STALE_TIMEOUT_MS,
	CLEANUP_INTERVAL_MS,
	FILE_WRITE_TIMEOUT_MS,
	SOLUTIONS_DIR
} from './config';
import { validatePlayerCode, sanitizePlayerCode } from './validate-code';

const log = createLogger('SandboxManager');

/**
 * Manages E2B sandboxes for game rooms.
 * ONE sandbox per room, shared by all players in that room.
 */
class SandboxManagerImpl {
	private sandboxes = new Map<string, RoomSandbox>();
	private logSubscribers = new Map<string, LogCallback[]>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.startCleanupInterval();
	}

	// --------------------------------------------------------------------------
	// Sandbox Lifecycle
	// --------------------------------------------------------------------------

	/**
	 * Get or create a sandbox for a room.
	 * If sandbox already exists, updates lastActivity and returns it.
	 */
	async getOrCreate(roomId: string): Promise<Sandbox> {
		const existing = this.sandboxes.get(roomId);
		if (existing) {
			existing.lastActivity = Date.now();
			return existing.sandbox;
		}

		log.info('Creating sandbox', { roomId });

		try {
			log.info('Calling Sandbox.create...', { roomId, template: TEMPLATE_ID });
			const sandbox = await Sandbox.create(TEMPLATE_ID, {
				apiKey: env.E2B_API_KEY,
				timeoutMs: SANDBOX_TIMEOUT_MS
			});

			this.sandboxes.set(roomId, {
				sandbox,
				roomId,
				createdAt: Date.now(),
				lastActivity: Date.now(),
				serverReady: false
			});

			log.info('Sandbox created', { roomId, sandboxId: sandbox.sandboxId });
			return sandbox;
		} catch (error) {
			log.error('Sandbox.create FAILED', { roomId, error: String(error), stack: (error as Error).stack });
			throw error;
		}
	}

	/**
	 * Kill and remove sandbox for a room.
	 * Called when game ends or during cleanup.
	 */
	async kill(roomId: string): Promise<void> {
		const session = this.sandboxes.get(roomId);
		if (!session) return;

		log.info('Killing sandbox', { roomId });

		try {
			await session.sandbox.kill();
			log.info('Sandbox killed', { roomId });
		} catch (error) {
			log.error('Failed to kill sandbox', { roomId, error: String(error) });
		} finally {
			this.sandboxes.delete(roomId);
		}
	}

	/**
	 * Get raw sandbox instance for a room.
	 */
	get(roomId: string): Sandbox | null {
		return this.sandboxes.get(roomId)?.sandbox ?? null;
	}

	// --------------------------------------------------------------------------
	// Sandbox State
	// --------------------------------------------------------------------------

	/**
	 * Check if room's sandbox server is ready (Vite running).
	 */
	isReady(roomId: string): boolean {
		return this.sandboxes.get(roomId)?.serverReady ?? false;
	}

	/**
	 * Mark room's sandbox server as ready.
	 */
	markReady(roomId: string): void {
		const session = this.sandboxes.get(roomId);
		if (session) {
			session.serverReady = true;
			log.debug('Sandbox marked ready', { roomId });
		}
	}

	/**
	 * Get sandbox URL for a specific player in a room.
	 * Each player gets the same sandbox but with their ID in the query string.
	 */
	getPlayerUrl(roomId: string, playerId: string): string | null {
		const session = this.sandboxes.get(roomId);
		if (!session) return null;
		const params = new URLSearchParams({ player: playerId });
		return `https://${session.sandbox.getHost(3000)}?${params.toString()}`;
	}

	// --------------------------------------------------------------------------
	// Player Code
	// --------------------------------------------------------------------------

	/**
	 * Write player's code to their solution file in the sandbox.
	 * Each player has their own file: /src/solutions/{playerId}.svelte
	 * Code is validated and sanitized before writing.
	 */
	async updatePlayerCode(roomId: string, playerId: string, code: string): Promise<void> {
		const session = this.sandboxes.get(roomId);
		if (!session) {
			log.debug('No sandbox for room - code update ignored', { roomId });
			return;
		}

		session.lastActivity = Date.now();

		// Validate and sanitize code
		const validation = validatePlayerCode(code, playerId);
		const safeCode = validation.valid ? code : sanitizePlayerCode(code);

		if (!validation.valid) {
			log.warn('Player code failed validation, using sanitized version', {
				playerId,
				blocked: validation.blocked
			});
		}

		// Ensure solutions directory exists
		await session.sandbox.commands
			.run(`mkdir -p ${SOLUTIONS_DIR}`, { timeoutMs: 5000 })
			.catch(() => {});

		// Write to player-specific solution file with timeout
		const writePromise = session.sandbox.files.write(
			`${SOLUTIONS_DIR}/${playerId}.svelte`,
			safeCode
		);
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('File write timeout')), FILE_WRITE_TIMEOUT_MS)
		);

		await Promise.race([writePromise, timeoutPromise]);
	}

	// --------------------------------------------------------------------------
	// Logging
	// --------------------------------------------------------------------------

	/**
	 * Subscribe to log messages for a player.
	 * Returns unsubscribe function.
	 */
	subscribeToLogs(playerId: string, callback: LogCallback): () => void {
		const existing = this.logSubscribers.get(playerId) ?? [];
		existing.push(callback);
		this.logSubscribers.set(playerId, existing);

		return () => {
			const subs = this.logSubscribers.get(playerId) ?? [];
			const index = subs.indexOf(callback);
			if (index > -1) subs.splice(index, 1);
			if (subs.length === 0) this.logSubscribers.delete(playerId);
		};
	}

	/**
	 * Emit a log message to all subscribers for a player.
	 */
	emitLog(playerId: string, message: string): void {
		const subs = this.logSubscribers.get(playerId) ?? [];
		const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
		const formatted = `[${timestamp}] ${message}`;

		log.debug('Sandbox log', { playerId, message });
		for (const sub of subs) {
			try {
				sub(formatted);
			} catch (error) {
				log.error('Log subscriber error', { playerId, error: String(error) });
			}
		}
	}

	// --------------------------------------------------------------------------
	// Cleanup
	// --------------------------------------------------------------------------

	/**
	 * Start interval to clean up stale sandboxes.
	 * Runs every minute, kills sandboxes idle for 15+ minutes.
	 */
	private startCleanupInterval(): void {
		this.cleanupInterval = setInterval(async () => {
			const now = Date.now();

			for (const [roomId, session] of this.sandboxes) {
				if (now - session.lastActivity > STALE_TIMEOUT_MS) {
					log.info('Cleaning up stale sandbox', { roomId });
					await this.kill(roomId);
				}
			}
		}, CLEANUP_INTERVAL_MS);
	}

	/**
	 * Stop the cleanup interval (for testing).
	 */
	stopCleanupInterval(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	/**
	 * Kill all active sandboxes.
	 * Used for test cleanup to avoid leaving sandboxes running.
	 * @returns Number of sandboxes killed
	 */
	async killAll(): Promise<number> {
		const roomIds = Array.from(this.sandboxes.keys());
		log.info('Killing all sandboxes', { count: roomIds.length });

		let killed = 0;
		for (const roomId of roomIds) {
			try {
				await this.kill(roomId);
				killed++;
			} catch (error) {
				log.error('Failed to kill sandbox during killAll', { roomId, error: String(error) });
			}
		}

		log.info('All sandboxes killed', { killed, total: roomIds.length });
		return killed;
	}

	/**
	 * Get count of active sandboxes.
	 */
	getActiveCount(): number {
		return this.sandboxes.size;
	}
}

// Export singleton instance
export const SandboxManager = new SandboxManagerImpl();
