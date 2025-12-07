/**
 * Durable Object Client
 *
 * Clean API for calling the GameRoom DO from SvelteKit.
 * Handles HTTP RPC calls and WebSocket URL generation.
 */

import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Room, Challenge, ModelId } from '$lib/types/game';
import { getShuffledChallenges } from '$lib/server/challenges';

// ============================================================================
// Configuration
// ============================================================================

// Internal URL for server-to-worker calls (can be host.docker.internal in Docker)
// Using getters to ensure env vars are read at request time, not module load time
function getWorkerUrl(): string {
	if (dev) return 'http://localhost:8788';
	// Try process.env first (works better with bun), fallback to SvelteKit env
	return process.env.WORKER_URL || env.WORKER_URL || 'https://api.vibecodearena.dev';
}

// Public URL for browser-to-worker WebSocket (must be reachable from browser)
function getPublicWorkerUrl(): string {
	if (dev) return 'http://localhost:8788';
	// Try process.env first (works better with bun), fallback to SvelteKit env
	return process.env.PUBLIC_WORKER_URL || env.PUBLIC_WORKER_URL || process.env.WORKER_URL || env.WORKER_URL || 'https://api.vibecodearena.dev';
}

// ============================================================================
// Types
// ============================================================================

interface SubmitSolutionParams {
	playerId: string;
	passed: boolean;
	promptsUsed: number;
	code: string;
	similarityScore: number;
	sandboxUrl?: string;
	screenshotUrl?: string;
}

interface SubmitSolutionResult {
	room: Room;
	roundScore: number;
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function rpc<T>(roomCode: string, method: string, params?: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${getWorkerUrl()}/room/${roomCode}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ method, params }),
	});

	if (!res.ok) {
		const error = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error((error as { error?: string }).error || 'RPC failed');
	}

	return res.json() as Promise<T>;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${getWorkerUrl()}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	return res.json() as Promise<T>;
}

// ============================================================================
// Room API
// ============================================================================

export const room = {
	/** Get room state (public, sanitized) */
	async get(roomCode: string): Promise<Room | null> {
		const res = await fetch(`${getWorkerUrl()}/room/${roomCode}`);
		const data = await res.json() as { room: Room | null };
		return data.room;
	},

	/** Get room with full challenge (includes referenceCode) */
	async getFull(roomCode: string): Promise<Room | null> {
		return rpc<Room | null>(roomCode, 'getRoomFull');
	},

	/** Create a new room with pre-picked challenges */
	async create(hostName: string, hostModel: ModelId): Promise<{ room: Room; playerId: string }> {
		const challenges = getShuffledChallenges();
		return post('/create', { hostName, hostModel, challenges });
	},

	/** Join an existing room */
	async join(roomCode: string, playerName: string, model: ModelId): Promise<{ room: Room; playerId: string } | { error: string } | null> {
		const res = await fetch(`${getWorkerUrl()}/join/${roomCode}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ playerName, model }),
		});
		if (!res.ok) return null;
		return res.json() as Promise<{ room: Room; playerId: string } | { error: string }>;
	},

	/** Remove a player from room */
	async removePlayer(roomCode: string, playerId: string): Promise<Room | null> {
		return rpc<Room | null>(roomCode, 'removePlayer', { playerId });
	},
};

// ============================================================================
// Game API
// ============================================================================

export const game = {
	/** Start the game (host only) */
	async start(roomCode: string): Promise<Room | null> {
		return rpc<Room | null>(roomCode, 'startGame');
	},

	/** Set the current challenge */
	async setChallenge(roomCode: string, challenge: Challenge): Promise<Room | null> {
		return rpc<Room | null>(roomCode, 'setChallenge', { challenge });
	},

	/** Submit a solution */
	async submitSolution(roomCode: string, params: SubmitSolutionParams): Promise<SubmitSolutionResult | null> {
		return rpc(roomCode, 'submitSolution', params as unknown as Record<string, unknown>);
	},

	/** Mark player as ready during review */
	async markReady(roomCode: string, playerId: string): Promise<boolean> {
		return rpc<boolean>(roomCode, 'markPlayerReady', { playerId });
	},
};

// ============================================================================
// Scoring API
// ============================================================================

export const scoring = {
	/** Deduct points from a player */
	async deduct(roomCode: string, playerId: string, points: number): Promise<boolean> {
		return rpc<boolean>(roomCode, 'deductScore', { playerId, points });
	},

	/** Use a hint */
	async useHint(roomCode: string, playerId: string): Promise<{ success: boolean; hintsRemaining: number }> {
		return rpc(roomCode, 'useHint', { playerId });
	},

	/** Get remaining hints */
	async getHintsRemaining(roomCode: string, playerId: string): Promise<number> {
		return rpc<number>(roomCode, 'getHintsRemaining', { playerId });
	},
};

// ============================================================================
// Judging API
// ============================================================================

export const judging = {
	/** Mark player as being judged */
	async start(roomCode: string, playerId: string): Promise<void> {
		await rpc(roomCode, 'startJudging', { playerId });
	},

	/** Mark judging complete */
	async finish(roomCode: string, playerId: string): Promise<void> {
		await rpc(roomCode, 'finishJudging', { playerId });
	},

	/** Track infrastructure wait time */
	async trackWaitTime(roomCode: string, playerId: string, ms: number): Promise<void> {
		await rpc(roomCode, 'trackWaitTime', { playerId, ms });
	},
};

// ============================================================================
// Sandbox API
// ============================================================================

export const sandbox = {
	/** Notify that player's sandbox is ready */
	async setReady(roomCode: string, playerId: string): Promise<void> {
		await rpc(roomCode, 'setPlayerSandboxReady', { playerId });
	},

	/** Emit sandbox ready event with URL */
	async emitReady(roomCode: string, playerId: string, sandboxUrl: string): Promise<void> {
		await rpc(roomCode, 'emitSandboxReady', { playerId, sandboxUrl });
	},

	/** Emit a sandbox log message */
	async emitLog(roomCode: string, message: string): Promise<void> {
		await rpc(roomCode, 'emitSandboxLog', { message });
	},
};

// ============================================================================
// WebSocket
// ============================================================================

/** Get WebSocket URL for real-time updates (uses public URL for browser) */
export function getWebSocketUrl(roomCode: string, playerId: string): string {
	const wsUrl = getPublicWorkerUrl().replace('http', 'ws');
	return `${wsUrl}/room/${roomCode}?playerId=${playerId}`;
}

