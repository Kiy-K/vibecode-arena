import { CHALLENGES, getRandomChallenge, getChallengeById } from '$lib/config/challenges';
import type { Challenge } from '$lib/types/game';

export { CHALLENGES, getChallengeById };

export function getRandomPresetChallenge(excludeIds: string[] = []): Challenge {
	return getRandomChallenge(excludeIds);
}

export async function generateChallenge(excludeIds: string[] = []): Promise<Challenge> {
	// For now, return a random preset
	// AI generation of challenges can be added later
	// Fetching challenges from challenges directory for ease of use
	return getRandomChallenge(excludeIds);
}
