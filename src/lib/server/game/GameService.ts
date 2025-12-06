import type { Room, Player, Challenge } from '$lib/types/game';

import { RoomService } from '../rooms/RoomService';
import { calculateScore } from '../scoring';
import { roomEvents } from '../events';
import { createLogger } from '../logger';
import { getPlayerWaitTime, resetPlayerWaitTime, resetPlayerPrompts } from '../ratelimit';
import { SandboxManager } from '../e2b';
import { resetHints, resetAllHints } from '../ai/tools';
import { sanitizeRoom, sanitizeChallenge } from '../sanitize';

const log = createLogger('GameService');

// ============================================================================
// Constants
// ============================================================================

/** Duration of the review phase between rounds (ms) */
const REVIEW_DURATION = 20_000;

/** Delay before ending round after all players submit (ms) */
const END_ROUND_DELAY = 10_000;

/** Delay after judging completes before transitioning to review (ms) */
const POST_JUDGING_DELAY = 3_000;

// ============================================================================
// State
// ============================================================================

/** Active round timers per room */
const roundTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Players marked as ready during review phase */
const playersReady = new Map<string, Set<string>>();

/** Players currently being judged per room */
const playersJudging = new Map<string, Set<string>>();

/** Rooms waiting for judging to complete before ending round */
const roomsWaitingForJudging = new Set<string>();

// ============================================================================
// GameService
// ============================================================================

/**
 * Core game logic service.
 * Handles game flow: starting, challenges, submissions, rounds, and scoring.
 */
class GameServiceImpl {
	// --------------------------------------------------------------------------
	// Game Lifecycle
	// --------------------------------------------------------------------------

	/**
	 * Start a game in a room.
	 * Transitions room from 'waiting' to 'playing' state.
	 */
	start(roomId: string): Room | null {
		const room = RoomService.get(roomId);
		if (!room || room.status !== 'waiting') return null;

		room.status = 'playing';
		room.round = 0;
		return room;
	}

	/**
	 * Set the current challenge for a room.
	 * Resets player state and starts the round timer.
	 */
	setChallenge(roomId: string, challenge: Challenge): Room | null {
		const room = RoomService.get(roomId);
		if (!room) return null;

		this.clearRoundTimer(roomId);

		room.status = 'playing';
		room.currentChallenge = challenge;
		room.challengeStartTime = Date.now();
		room.round++;

		// Track used challenges to avoid repeats
		if (!room.usedChallengeIds.includes(challenge.id)) {
			room.usedChallengeIds.push(challenge.id);
		}

		const roundId = `${room.id}:${room.round}`;

		// Reset player state for new round
		for (const player of room.players) {
			player.submissionTime = undefined;
			player.passed = undefined;
			player.code = undefined;
			player.sandboxUrl = undefined;
			player.roundScore = undefined;
			resetPlayerWaitTime(player.id, roundId);
			resetPlayerPrompts(player.id, roundId);
			resetHints(player.id); // Reset hint usage for new challenge
		}

		// Auto-end round when time limit is reached
		const timeoutMs = challenge.timeLimit * 1000;
		const timer = setTimeout(() => this.endRound(roomId), timeoutMs);
		roundTimers.set(roomId, timer);

		return room;
	}

	// --------------------------------------------------------------------------
	// Submissions
	// --------------------------------------------------------------------------

	/**
	 * Submit a player's solution for the current challenge.
	 * Calculates score and checks if round should end early.
	 */
	submitSolution(
		roomId: string,
		playerId: string,
		passed: boolean,
		promptsUsed: number,
		code: string,
		similarityScore: number,
		sandboxUrl?: string,
		screenshotUrl?: string
	): { room: Room; roundScore: number } | null {
		const room = RoomService.get(roomId);
		if (!room?.challengeStartTime || room.status !== 'playing') return null;

		const player = room.players.find((p) => p.id === playerId);
		if (!player || player.submissionTime !== undefined) return null;

		const timeTaken = Date.now() - room.challengeStartTime;
		const roundId = `${room.id}:${room.round}`;
		const waitTime = getPlayerWaitTime(playerId, roundId);

		// Update player state
		player.submissionTime = timeTaken;
		player.passed = passed;
		player.promptsUsed += promptsUsed;
		player.code = code;
		player.sandboxUrl = sandboxUrl;
		player.screenshotUrl = screenshotUrl;

		// Calculate and apply score
		const roundScore = calculateScore(
			player,
			room,
			timeTaken,
			promptsUsed,
			waitTime,
			similarityScore,
			passed
		);
		player.score += roundScore;
		player.roundScore = roundScore;

		// End round early if everyone submitted
		if (this.allPlayersSubmitted(roomId)) {
			this.clearRoundTimer(roomId);
			setTimeout(() => this.endRound(roomId), END_ROUND_DELAY);
		}

		return { room, roundScore };
	}

	// --------------------------------------------------------------------------
	// Round Management
	// --------------------------------------------------------------------------

	/**
	 * End the current round.
	 * Marks non-submitters, transitions to review or finished state.
	 * If judging is in progress, waits for it to complete first.
	 */
	endRound(roomId: string): Room | null {
		const room = RoomService.get(roomId);
		if (!room || room.status !== 'playing') return null;

		this.clearRoundTimer(roomId);

		// If judging is in progress, wait for it to complete
		if (this.isJudgingInProgress(roomId)) {
			roomsWaitingForJudging.add(roomId);
			roomEvents.emit(roomId, 'waiting_for_judging', {
				judgingCount: this.getJudgingCount(roomId)
			});
			log.info('Round waiting for judging to complete', {
				roomId,
				judgingCount: this.getJudgingCount(roomId)
			});
			return null;
		}

		// Mark players who didn't submit
		for (const player of room.players) {
			if (player.submissionTime === undefined) {
				player.submissionTime = -1;
				player.passed = false;
				player.roundScore = 0;
			}
		}

		// Always go to review phase first
		room.status = 'reviewing';
		playersReady.delete(roomId);

		const isLastRound = room.round >= room.maxRounds;

		roomEvents.emit(roomId, 'round_ended', {
			room: sanitizeRoom(room),
			leaderboard: this.getLeaderboard(roomId),
			reviewDuration: REVIEW_DURATION,
			isLastRound
		});

		// After review period: end game or start next round
		const timer = setTimeout(() => {
			if (isLastRound) {
				this.finishGame(roomId);
			} else {
				this.startNextRound(roomId);
			}
		}, REVIEW_DURATION);
		roundTimers.set(roomId, timer);

		return room;
	}

	/**
	 * Finish the game after the last round's review period.
	 */
	finishGame(roomId: string): void {
		const room = RoomService.get(roomId);
		if (!room || room.status !== 'reviewing') return;

		room.status = 'finished';

		roomEvents.emit(roomId, 'game_ended', {
			room: sanitizeRoom(room),
			leaderboard: this.getLeaderboard(roomId)
		});

		// Clean up resources
		playersReady.delete(roomId);
		resetAllHints();
		SandboxManager.kill(roomId).catch((err) => {
			log.error('Failed to kill sandbox on game end', { roomId, error: String(err) });
		});
	}

	/**
	 * Start the next round with a new challenge.
	 */
	startNextRound(roomId: string): void {
		const room = RoomService.get(roomId);
		if (!room || room.status !== 'reviewing') return;

		playersReady.delete(roomId);

		// Dynamic import to avoid circular dependency
		import('../challenges')
			.then(async ({ getRandomPresetChallenge }) => {
				const challenge = getRandomPresetChallenge(room.usedChallengeIds);
				const updatedRoom = this.setChallenge(roomId, challenge);

				if (updatedRoom) {
					// Clear sandbox files for all players
					for (const player of updatedRoom.players) {
						await SandboxManager.updatePlayerCode(
							roomId,
							player.id,
							'<!-- New round - waiting for code -->'
						).catch(() => {});
					}

					roomEvents.emit(roomId, 'challenge_started', {
						room: sanitizeRoom(updatedRoom),
						challenge: sanitizeChallenge(challenge)
					});
				}
			})
			.catch((error) => {
				log.error('Failed to start next round', { roomId, error: String(error) });
				// Emit error event so players know something went wrong
				roomEvents.emit(roomId, 'game_error', {
					message: 'Failed to load next challenge. Please try again.'
				});
			});
	}

	// --------------------------------------------------------------------------
	// Ready State
	// --------------------------------------------------------------------------

	/**
	 * Mark a player as ready to continue during review phase.
	 * If all players are ready, starts next round immediately.
	 */
	markPlayerReady(roomId: string, playerId: string): boolean {
		const room = RoomService.get(roomId);
		if (!room || room.status !== 'reviewing') return false;

		if (!playersReady.has(roomId)) {
			playersReady.set(roomId, new Set());
		}
		playersReady.get(roomId)!.add(playerId);

		roomEvents.emit(roomId, 'player_ready', {
			playerId,
			readyCount: playersReady.get(roomId)!.size,
			totalPlayers: room.players.length
		});

		// Start immediately if all ready
		if (playersReady.get(roomId)!.size >= room.players.length) {
			this.clearRoundTimer(roomId);
			const isLastRound = room.round >= room.maxRounds;
			if (isLastRound) {
				this.finishGame(roomId);
			} else {
				this.startNextRound(roomId);
			}
			return true;
		}

		return false;
	}

	/**
	 * Get count of players marked as ready.
	 */
	getReadyCount(roomId: string): number {
		return playersReady.get(roomId)?.size ?? 0;
	}

	// --------------------------------------------------------------------------
	// Queries
	// --------------------------------------------------------------------------

	/**
	 * Check if new submissions are allowed.
	 * Returns false if room is waiting for judging to complete (timer hit 0).
	 */
	canStartSubmission(roomId: string): boolean {
		return !roomsWaitingForJudging.has(roomId);
	}

	/**
	 * Check if all players have submitted their solutions.
	 */
	allPlayersSubmitted(roomId: string): boolean {
		const room = RoomService.get(roomId);
		return room?.players.every((p) => p.submissionTime !== undefined) ?? false;
	}

	/**
	 * Get sorted leaderboard for a room.
	 */
	getLeaderboard(roomId: string): Player[] {
		const room = RoomService.get(roomId);
		return room ? [...room.players].sort((a, b) => b.score - a.score) : [];
	}

	/**
	 * Deduct points from a player's score (e.g., for using hints).
	 * Score cannot go below 0.
	 */
	deductScore(roomId: string, playerId: string, points: number): boolean {
		const room = RoomService.get(roomId);
		if (!room) return false;

		const player = room.players.find((p) => p.id === playerId);
		if (!player) return false;

		player.score = Math.max(0, player.score - points);
		log.info('Score deducted', { playerId, points, newScore: player.score });

		// Emit event so frontend can update
		roomEvents.emit(roomId, 'player_score_updated', {
			playerId,
			score: player.score,
			deducted: points
		});

		return true;
	}

	/**
	 * Validate that a player can access chat for the current challenge.
	 */
	validateChatAccess(
		roomCode: string,
		playerId: string
	): { valid: true; room: Room; player: Player } | { valid: false; error: string } {
		const room = RoomService.getByCode(roomCode);
		if (!room) return { valid: false, error: 'Room not found' };
		if (room.status !== 'playing') return { valid: false, error: 'Game is not active' };

		const player = room.players.find((p) => p.id === playerId);
		if (!player) return { valid: false, error: 'Player not in room' };
		if (player.passed) return { valid: false, error: 'Already passed this challenge' };

		return { valid: true, room, player };
	}

	// --------------------------------------------------------------------------
	// Private
	// --------------------------------------------------------------------------

	private clearRoundTimer(roomId: string): void {
		const timer = roundTimers.get(roomId);
		if (timer) {
			clearTimeout(timer);
			roundTimers.delete(roomId);
		}
	}

	// --------------------------------------------------------------------------
	// Judging State Tracking
	// --------------------------------------------------------------------------

	/**
	 * Mark a player as currently being judged.
	 * Call this when starting AI analysis.
	 */
	startJudging(roomId: string, playerId: string): void {
		if (!playersJudging.has(roomId)) {
			playersJudging.set(roomId, new Set());
		}
		playersJudging.get(roomId)!.add(playerId);

		roomEvents.emit(roomId, 'judging_started', {
			playerId,
			judgingCount: playersJudging.get(roomId)!.size
		});
	}

	/**
	 * Mark a player's judging as complete.
	 * If room was waiting for judging and all done, ends the round.
	 */
	finishJudging(roomId: string, playerId: string): void {
		const judging = playersJudging.get(roomId);
		if (judging) {
			judging.delete(playerId);

			roomEvents.emit(roomId, 'judging_finished', {
				playerId,
				judgingCount: judging.size
			});

			// If room was waiting for judging to complete and all done, end round after delay
			if (roomsWaitingForJudging.has(roomId) && judging.size === 0) {
				roomsWaitingForJudging.delete(roomId);

				// Emit event so frontend knows judging is done, with countdown
				roomEvents.emit(roomId, 'judging_complete', {
					delay: POST_JUDGING_DELAY
				});

				// Small delay to let players see their results before review
				setTimeout(() => this.endRound(roomId), POST_JUDGING_DELAY);
			}
		}
	}

	/**
	 * Check if any players are currently being judged.
	 */
	isJudgingInProgress(roomId: string): boolean {
		const judging = playersJudging.get(roomId);
		return judging ? judging.size > 0 : false;
	}

	/**
	 * Get count of players currently being judged.
	 */
	getJudgingCount(roomId: string): number {
		return playersJudging.get(roomId)?.size ?? 0;
	}
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const GameService = new GameServiceImpl();
