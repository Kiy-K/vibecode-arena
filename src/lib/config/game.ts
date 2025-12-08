/**
 * Shared game configuration constants.
 * Used by both SvelteKit frontend and Cloudflare Worker.
 */

// ============================================================================
// Room Codes
// ============================================================================

/** Characters used for room codes (no ambiguous chars like 0/O, 1/I/L) */
export const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** Generate a random room code */
export function generateRoomCode(): string {
	let code = '';
	for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
		code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
	}
	return code;
}

// ============================================================================
// Timers (milliseconds)
// ============================================================================

export const TIMERS = {
	/** Duration of review phase between rounds */
	REVIEW_DURATION: 20_000,
	/** Delay before ending round after all players submit */
	END_ROUND_DELAY: 10_000,
	/** Delay after judging completes before transitioning to review */
	POST_JUDGING_DELAY: 3_000
} as const;

// ============================================================================
// Scoring
// ============================================================================

export const SCORING = {
	/** Base score for passing */
	BASE: 1000,
	/** Maximum bonus for fast completion */
	TIME_BONUS_MAX: 150,
	/** Maximum bonus for prompt efficiency */
	EFFICIENCY_BONUS_MAX: 200,
	/** Points lost per prompt used */
	EFFICIENCY_PENALTY_PER_PROMPT: 40,
	/** Bonus points for finishing 1st, 2nd, 3rd */
	POSITION_BONUSES: [250, 150, 50] as const,
	/** Cost per hint used */
	HINT_COST: 50,
	/** Maximum hints per round */
	MAX_HINTS: 3
} as const;

// ============================================================================
// Game Settings
// ============================================================================

export const GAME = {
	/** Default number of rounds per game */
	DEFAULT_ROUNDS: 5,
	/** Minimum players to start */
	MIN_PLAYERS: 1,
	/** Maximum players per room */
	MAX_PLAYERS: 10
} as const;
