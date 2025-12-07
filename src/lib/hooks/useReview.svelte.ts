/**
 * Review phase state hook.
 * Manages the review/leaderboard phase between game rounds.
 *
 * Handles:
 * - Review countdown timer
 * - Player ready state tracking
 * - "Continue" button functionality
 *
 * @example
 * ```ts
 * const review = useReview('ABC123', 'player-1');
 * review.start(players, 10000); // Start 10s review
 * // review.countdown shows remaining seconds
 * await review.continueToNextRound(); // Player clicks continue
 * // review.isReady becomes true
 * ```
 */

import type { Player, PublicPlayer } from '$lib/types/game';
import { useCountdown } from './useCountdown.svelte';
import { markReady } from '../../routes/[code]/game.remote';

/**
 * Creates review phase state management.
 *
 * @param roomCode - The room code for API calls
 * @param playerId - Current player's ID
 * @returns Review state and controls
 */
export function useReview(roomCode: string, playerId: string) {
	const countdown = useCountdown();

	/** Players in the review (sorted by score) */
	let players: PublicPlayer[] = $state([]);
	/** Number of players who clicked "Continue" */
	let readyCount = $state(0);
	/** Whether current player has clicked "Continue" */
	let isReady = $state(false);
	/** Loading state for the "Continue" button */
	let markingReady = $state(false);

	/**
	 * Start the review phase.
	 * @param reviewPlayers - Players to display (usually sorted by score)
	 * @param durationMs - Review duration in milliseconds
	 */
	function start(reviewPlayers: PublicPlayer[], durationMs: number) {
		// Reset state from previous round
		isReady = false;
		readyCount = 0;
		markingReady = false;

		players = reviewPlayers;
		countdown.start(Math.ceil(durationMs / 1000));
	}

	/**
	 * Handle a player ready event from WebSocket.
	 * @param readyPlayerId - ID of the player who is ready
	 * @param count - Total count of ready players
	 */
	function handlePlayerReady(readyPlayerId: string, count: number) {
		readyCount = count;
		if (readyPlayerId === playerId) {
			isReady = true;
		}
	}

	/**
	 * Mark current player as ready to continue.
	 * Sends request to server and updates local state.
	 */
	async function continueToNextRound() {
		if (isReady || markingReady) return;

		markingReady = true;
		try {
			await markReady(roomCode);
			isReady = true;
		} catch (err) {
			console.error('Failed to mark ready:', err);
		} finally {
			markingReady = false;
		}
	}

	/**
	 * Reset all review state for a new round.
	 */
	function reset() {
		countdown.reset();
		players = [];
		readyCount = 0;
		isReady = false;
		markingReady = false;
	}

	return {
		/** Remaining review time in seconds */
		get countdown() {
			return countdown.value;
		},
		/** Players in the review (for leaderboard display) */
		get players() {
			return players;
		},
		/** Number of players ready to continue */
		get readyCount() {
			return readyCount;
		},
		/** Whether current player clicked "Continue" */
		get isReady() {
			return isReady;
		},
		/** Loading state for continue button */
		get markingReady() {
			return markingReady;
		},
		start,
		handlePlayerReady,
		continueToNextRound,
		reset
	};
}
