/**
 * Remote commands for game actions.
 * These are called from the client via SvelteKit's command() API.
 */

import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';

import { GameService } from '$lib/server/game';
import { RoomService } from '$lib/server/rooms/RoomService';
import { runCode } from '$lib/server/runner';
import { startRoomSandbox, previewCode, SandboxManager } from '$lib/server/e2b';
import { roomEvents } from '$lib/server/events';
import { getPlayerPromptCount, addPlayerWaitTime } from '$lib/server/ratelimit';
import { getRandomPresetChallenge } from '$lib/server/challenges';
import { getCodeFromMessage } from '$lib/server/chat-store';
import { sanitizeRoom, sanitizeChallenge } from '$lib/server/sanitize';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the current player ID from cookies for a specific room.
 */
function getPlayerId(roomId: string): string | undefined {
	const { cookies } = getRequestEvent();
	return cookies.get(`player_${roomId}`);
}

/**
 * Get room by code or throw 404.
 */
function requireRoom(roomCode: string) {
	const room = RoomService.getByCode(roomCode);
	if (!room) error(404, 'Room not found');
	return room;
}

/**
 * Get player ID or throw 403.
 */
function requirePlayer(roomId: string): string {
	const playerId = getPlayerId(roomId);
	if (!playerId) error(403, 'Not in room');
	return playerId;
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Start a new round (host only).
 * Creates sandbox if needed, picks a challenge, and notifies all players.
 */
export const startRound = command(v.string(), async (roomCode) => {
	const room = requireRoom(roomCode);
	const playerId = getPlayerId(room.id);

	if (room.hostId !== playerId) {
		error(403, 'Only host can start the game');
	}

	// Ensure sandbox is ready (ONE sandbox for all players)
	if (!SandboxManager.isReady(room.id)) {
		await startRoomSandbox(room.id);
	}

	// Start game and set challenge (excluding already used challenges)
	GameService.start(room.id);
	const challenge = getRandomPresetChallenge(room.usedChallengeIds);
	const updatedRoom = GameService.setChallenge(room.id, challenge);

	if (!updatedRoom) {
		error(500, 'Failed to start challenge');
	}

	// Reset player solution files and notify all players with their sandbox URLs
	for (const player of updatedRoom.players) {
		// Clear the player's solution file for the new round
		await SandboxManager.updatePlayerCode(room.id, player.id, '<!-- New round - waiting for code -->');

		roomEvents.emit(room.id, 'sandbox_ready', {
			playerId: player.id,
			sandboxUrl: SandboxManager.getPlayerUrl(room.id, player.id)
		});
	}

	roomEvents.emit(room.id, 'challenge_started', {
		room: sanitizeRoom(updatedRoom),
		challenge: sanitizeChallenge(challenge)
	});

	return { success: true };
});

/**
 * Submit code for the current challenge.
 * Takes a messageId and retrieves the code from server-side chat store.
 * This ensures players can only submit code that came from AI responses.
 */
export const submitCode = command(
	v.object({ roomCode: v.string(), messageId: v.string() }),

	async ({ roomCode, messageId }) => {
		const room = requireRoom(roomCode);
		const playerId = requirePlayer(room.id);

		if (!room.currentChallenge) {
			error(400, 'No active challenge');
		}

		// Block new submissions if timer reached 0 and we're waiting for judging to finish
		if (!GameService.canStartSubmission(room.id)) {
			error(400, 'Time is up - submissions are closed');
		}

		const roundId = `${room.id}:${room.round}`;

		// Retrieve code from server-side chat store
		const code = getCodeFromMessage(playerId, roundId, messageId);
		if (!code) {
			error(400, 'Invalid message ID or no code found in message');
		}

		const promptsUsed = getPlayerPromptCount(playerId, roundId);

		// Mark player as being judged (before async operation)
		GameService.startJudging(room.id, playerId);

		let result;
		try {
			// Track infrastructure time (sandbox + evaluation)
			// Server-side always has full Challenge with referenceCode
			const challenge = room.currentChallenge as import('$lib/types/game').Challenge;
			const infraStart = Date.now();
			result = await runCode(code, challenge, playerId, room.id);
			addPlayerWaitTime(playerId, roundId, Date.now() - infraStart);
		} finally {
			// Always mark judging as complete
			GameService.finishJudging(room.id, playerId);
		}

		// Submit and score
		const submission = GameService.submitSolution(
			room.id,
			playerId,
			result.passed,
			promptsUsed,
			code,
			result.score,
			result.sandboxUrl,
			result.screenshotUrl
		);

		if (!submission) {
			error(400, 'Failed to submit');
		}

		const player = submission.room.players.find((p) => p.id === playerId);

		// Notify room
		roomEvents.emit(room.id, 'player_submitted', {
			playerId,
			passed: result.passed,
			score: player?.score,
			roundScore: submission.roundScore,
			timeTaken: player?.submissionTime,
			sandboxUrl: result.sandboxUrl,
			screenshotUrl: result.screenshotUrl,
			leaderboard: GameService.getLeaderboard(room.id)
		});

		return {
			result,
			score: player?.score ?? 0,
			roundScore: submission.roundScore,
			leaderboard: GameService.getLeaderboard(room.id)
		};
	}
);

/**
 * Mark player as ready to continue during review phase.
 */
export const markReady = command(v.string(), async (roomCode) => {
	const room = requireRoom(roomCode);
	const playerId = requirePlayer(room.id);

	GameService.markPlayerReady(room.id, playerId);

	return { success: true };
});

/**
 * Preview code in sandbox without scoring.
 * Takes a messageId and retrieves the code from server-side chat store.
 */
export const updatePreview = command(
	v.object({ roomCode: v.string(), messageId: v.string() }),
	async ({ roomCode, messageId }) => {
		const room = requireRoom(roomCode);
		const playerId = requirePlayer(room.id);

		const roundId = `${room.id}:${room.round}`;
		const code = getCodeFromMessage(playerId, roundId, messageId);
		if (!code) {
			error(400, 'Invalid message ID or no code found');
		}

		return await previewCode(code, playerId, room.id);
	}
);
