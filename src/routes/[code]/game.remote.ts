/**
 * Remote commands for game actions.
 * These are called from the client via SvelteKit's command() API.
 * Now uses DO client for state, keeps E2B/AI logic in SvelteKit.
 */

import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';

import { room, game, sandbox, judging } from '$lib/server/do-client';
import { runCode } from '$lib/server/runner';
import { startRoomSandbox, previewCode, SandboxManager } from '$lib/server/e2b';
import { getPlayerPromptCount, addPlayerWaitTime } from '$lib/server/ratelimit';
import { getCodeFromMessage } from '$lib/server/chat-store';
import type { Challenge } from '$lib/types/game';

// ============================================================================
// Helpers
// ============================================================================

function getPlayerId(roomId: string): string | undefined {
	const { cookies } = getRequestEvent();
	return cookies.get(`player_${roomId}`);
}

function requirePlayer(roomId: string): string {
	const playerId = getPlayerId(roomId);
	if (!playerId) error(403, 'Not in room');
	return playerId;
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Start the game (host only).
 * DO handles challenge selection and round progression automatically.
 */
export const startRound = command(v.string(), async (roomCode) => {
	const r = await room.getFull(roomCode);
	if (!r) error(404, 'Room not found');

	const playerId = getPlayerId(r.id);

	if (r.hostId !== playerId) {
		error(403, 'Only host can start the game');
	}

	// Ensure sandbox is ready (managed by SvelteKit)
	if (!SandboxManager.isReady(r.id)) {
		await startRoomSandbox(r.id, roomCode);
	}

	// Start game via DO (automatically starts first round)
	const updatedRoom = await game.start(roomCode);

	if (!updatedRoom) {
		error(500, 'Failed to start game');
	}

	// Reset player solution files and emit sandbox URLs
	for (const player of updatedRoom.players) {
		await SandboxManager.updatePlayerCode(r.id, player.id, '<!-- New round - waiting for code -->');
		const sandboxUrl = SandboxManager.getPlayerUrl(r.id, player.id);
		if (sandboxUrl) {
			await sandbox.emitReady(roomCode, player.id, sandboxUrl);
		}
	}

	return { success: true };
});

/**
 * Submit code for the current challenge.
 * Retrieves code from chat store, runs judging, updates DO with result.
 */
export const submitCode = command(
	v.object({ roomCode: v.string(), messageId: v.string() }),

	async ({ roomCode, messageId }) => {
		// Get room from DO (includes full challenge with referenceCode)
		const r = await room.getFull(roomCode);
		if (!r) error(404, 'Room not found');

		const playerId = requirePlayer(r.id);

		if (!r.currentChallenge) {
			error(400, 'No active challenge');
		}

		const roundId = `${r.id}:${r.round}`;

		// Retrieve code from SvelteKit's chat store
		const code = getCodeFromMessage(playerId, roundId, messageId);
		if (!code) {
			error(400, 'Invalid message ID or no code found in message');
		}

		const promptsUsed = getPlayerPromptCount(playerId, roundId);

		// Mark player as being judged via DO
		await judging.start(roomCode, playerId);

		let result;
		try {
			// Run judging (still in SvelteKit - uses E2B + AI)
			const challenge = r.currentChallenge as Challenge;
			const infraStart = Date.now();
			result = await runCode(code, challenge, playerId, r.id);
			addPlayerWaitTime(playerId, roundId, Date.now() - infraStart);

			// Track wait time in DO too
			await judging.trackWaitTime(roomCode, playerId, Date.now() - infraStart);
		} finally {
			// Mark judging complete via DO
			await judging.finish(roomCode, playerId);
		}

		// Submit solution to DO (handles scoring + broadcast)
		const submission = await game.submitSolution(roomCode, {
			playerId,
			passed: result.passed,
			promptsUsed,
			code,
			similarityScore: result.score,
			sandboxUrl: result.sandboxUrl,
			screenshotUrl: result.screenshotUrl
		});

		if (!submission) {
			error(400, 'Failed to submit');
		}

		return {
			result,
			score: submission.room.players.find((p) => p.id === playerId)?.score ?? 0,
			roundScore: submission.roundScore
		};
	}
);

/**
 * Mark player as ready to continue during review phase.
 */
export const markReady = command(v.string(), async (roomCode) => {
	const r = await room.getFull(roomCode);
	if (!r) error(404, 'Room not found');

	const playerId = requirePlayer(r.id);

	await game.markReady(roomCode, playerId);

	return { success: true };
});

/**
 * Preview code in sandbox without scoring.
 */
export const updatePreview = command(
	v.object({ roomCode: v.string(), messageId: v.string() }),
	async ({ roomCode, messageId }) => {
		const r = await room.getFull(roomCode);
		if (!r) error(404, 'Room not found');

		const playerId = requirePlayer(r.id);

		const roundId = `${r.id}:${r.round}`;
		const code = getCodeFromMessage(playerId, roundId, messageId);
		if (!code) {
			error(400, 'Invalid message ID or no code found');
		}

		return await previewCode(code, playerId, r.id);
	}
);
