/**
 * Rate limiting module.
 * Provides in-memory rate limiting for API endpoints.
 * Note: Use Redis for production multi-instance deployments.
 */

/** Rate limit entry storing count and window reset time */
interface RateLimitEntry {
	count: number;
	resetTime: number;
}

/** Active rate limit entries by key */
const limits = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(
	() => {
		const now = Date.now();
		for (const [key, entry] of limits) {
			if (entry.resetTime < now) {
				limits.delete(key);
			}
		}
	},
	5 * 60 * 1000
);

/** Rate limit configuration */
export interface RateLimitConfig {
	/** Time window in milliseconds */
	windowMs: number;
	/** Maximum requests allowed per window */
	maxRequests: number;
}

/**
 * Check and update rate limit for a given key.
 * @param key - Unique identifier (e.g., "chat:playerId")
 * @param config - Rate limit configuration
 * @returns Object with allowed status, remaining requests, and reset time
 */
export function checkRateLimit(
	key: string,
	config: RateLimitConfig
): { allowed: boolean; remaining: number; resetIn: number } {
	const now = Date.now();
	const entry = limits.get(key);

	if (!entry || entry.resetTime < now) {
		// New window
		limits.set(key, {
			count: 1,
			resetTime: now + config.windowMs
		});
		return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs };
	}

	if (entry.count >= config.maxRequests) {
		return { allowed: false, remaining: 0, resetIn: entry.resetTime - now };
	}

	entry.count++;
	return {
		allowed: true,
		remaining: config.maxRequests - entry.count,
		resetIn: entry.resetTime - now
	};
}

// =============================================================================
// Player Round Tracking
// =============================================================================

/** Prompts used per player per round */
const playerPrompts = new Map<string, number>();

/** Cumulative wait time per player per round (LLM + sandbox time in ms) */
const playerWaitTime = new Map<string, number>();

/** Create composite key for player+round */
const playerKey = (playerId: string, roundId: string) => `${playerId}:${roundId}`;

/**
 * Get the number of prompts a player has used this round.
 * @param playerId - Player ID
 * @param roundId - Round identifier (roomId:roundNumber)
 */
export function getPlayerPromptCount(playerId: string, roundId: string): number {
	return playerPrompts.get(playerKey(playerId, roundId)) || 0;
}

/**
 * Increment and return the player's prompt count for the round.
 * @param playerId - Player ID
 * @param roundId - Round identifier
 * @returns Updated prompt count
 */
export function incrementPlayerPrompt(playerId: string, roundId: string): number {
	const k = playerKey(playerId, roundId);
	const count = (playerPrompts.get(k) || 0) + 1;
	playerPrompts.set(k, count);
	return count;
}

/**
 * Reset a player's prompt count for the round.
 * Called when a new round starts.
 */
export function resetPlayerPrompts(playerId: string, roundId: string): void {
	playerPrompts.delete(playerKey(playerId, roundId));
}

/**
 * Get cumulative wait time for a player this round.
 * Used to fairly adjust time-based scoring.
 * @param playerId - Player ID
 * @param roundId - Round identifier
 * @returns Wait time in milliseconds
 */
export function getPlayerWaitTime(playerId: string, roundId: string): number {
	return playerWaitTime.get(playerKey(playerId, roundId)) || 0;
}

/**
 * Add to a player's cumulative wait time for the round.
 * @param playerId - Player ID
 * @param roundId - Round identifier
 * @param timeMs - Time to add in milliseconds
 * @returns Updated total wait time
 */
export function addPlayerWaitTime(playerId: string, roundId: string, timeMs: number): number {
	const k = playerKey(playerId, roundId);
	const total = (playerWaitTime.get(k) || 0) + timeMs;
	playerWaitTime.set(k, total);
	return total;
}

/**
 * Reset a player's wait time for the round.
 * Called when a new round starts.
 */
export function resetPlayerWaitTime(playerId: string, roundId: string): void {
	playerWaitTime.delete(playerKey(playerId, roundId));
}
