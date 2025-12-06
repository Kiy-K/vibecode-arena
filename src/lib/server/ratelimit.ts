// Simple in-memory rate limiter (use Redis for production)

interface RateLimitEntry {
	count: number;
	resetTime: number;
}

const limits = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of limits) {
		if (entry.resetTime < now) {
			limits.delete(key);
		}
	}
}, 5 * 60 * 1000);

export interface RateLimitConfig {
	windowMs: number; // Time window in milliseconds
	maxRequests: number; // Max requests per window
}
/**
 * Check and update rate limit for a given key - for now in-memory only.
 * Returns whether the request is allowed, remaining requests, and time until reset.
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
	return { allowed: true, remaining: config.maxRequests - entry.count, resetIn: entry.resetTime - now };
}

// Track prompts used per player per round
const playerPrompts = new Map<string, number>();

export function getPlayerPromptCount(playerId: string, roundId: string): number {
	const key = `${playerId}:${roundId}`;
	return playerPrompts.get(key) || 0;
}

export function incrementPlayerPrompt(playerId: string, roundId: string): number {
	const key = `${playerId}:${roundId}`;
	const count = (playerPrompts.get(key) || 0) + 1;
	playerPrompts.set(key, count);
	return count;
}

export function resetPlayerPrompts(playerId: string, roundId: string): void {
	const key = `${playerId}:${roundId}`;
	playerPrompts.delete(key);
}

// Track cumulative wait time per player per round (in ms)
// This includes LLM processing time + sandbox/infra time
const playerWaitTime = new Map<string, number>();

export function getPlayerWaitTime(playerId: string, roundId: string): number {
	const key = `${playerId}:${roundId}`;
	return playerWaitTime.get(key) || 0;
}

export function addPlayerWaitTime(playerId: string, roundId: string, timeMs: number): number {
	const key = `${playerId}:${roundId}`;
	const total = (playerWaitTime.get(key) || 0) + timeMs;
	playerWaitTime.set(key, total);
	return total;
}

export function resetPlayerWaitTime(playerId: string, roundId: string): void {
	const key = `${playerId}:${roundId}`;
	playerWaitTime.delete(key);
}
