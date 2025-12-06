/**
 * Challenge management module.
 * Handles challenge selection and generation.
 */

import { CHALLENGES, getRandomChallenge, getChallengeById } from '$lib/config/challenges';
import type { Challenge } from '$lib/types/game';

export { CHALLENGES, getChallengeById };

/**
 * Get a random challenge from the preset pool.
 * @param excludeIds - Challenge IDs to exclude (already used in current game)
 * @returns A random challenge not in the exclude list
 */
export function getRandomPresetChallenge(excludeIds: string[] = []): Challenge {
	return getRandomChallenge(excludeIds);
}

/**
 * Generate a challenge for the game.
 * Currently returns a random preset; AI generation can be added later.
 * @param excludeIds - Challenge IDs to exclude
 * @returns A challenge for the round
 */
export async function generateChallenge(excludeIds: string[] = []): Promise<Challenge> {
	return getRandomChallenge(excludeIds);
}
