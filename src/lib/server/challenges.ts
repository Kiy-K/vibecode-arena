/**
 * Challenge management module.
 * Handles challenge selection for games.
 */

import { CHALLENGES, getChallengeById } from '$lib/config/challenges';
import type { Challenge } from '$lib/types/game';
import { GAME } from '$lib/config/game';

export { CHALLENGES, getChallengeById };

/**
 * Get shuffled challenges for a new game.
 * Pre-picks all challenges at room creation time.
 * @param count - Number of rounds (defaults to GAME.DEFAULT_ROUNDS)
 * @returns Array of shuffled challenges for the game
 */
export function getShuffledChallenges(count: number = GAME.DEFAULT_ROUNDS): Challenge[] {
	// Shuffle all challenges
	const shuffled = [...CHALLENGES].sort(() => Math.random() - 0.5);
	// Take the first 'count' challenges (or cycle if not enough)
	const result: Challenge[] = [];
	for (let i = 0; i < count; i++) {
		result.push(shuffled[i % shuffled.length]);
	}
	return result;
}
