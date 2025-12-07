import { describe, it, expect } from 'vitest';
import { getShuffledChallenges, CHALLENGES, getChallengeById } from '$lib/server/challenges';
import { GAME } from '$lib/config/game';

describe('CHALLENGES', () => {
	it('has at least one challenge', () => {
		expect(CHALLENGES.length).toBeGreaterThan(0);
	});

	it('all challenges have required fields', () => {
		for (const challenge of CHALLENGES) {
			expect(challenge.id).toBeTruthy();
			expect(challenge.title).toBeTruthy();
			expect(challenge.description).toBeTruthy();
			expect(challenge.category).toBeTruthy();
			expect(challenge.timeLimit).toBeGreaterThan(0);
		}
	});

	it('all challenges have unique IDs', () => {
		const ids = CHALLENGES.map((c) => c.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it('all challenges have valid time limits', () => {
		for (const challenge of CHALLENGES) {
			// Time limits should be between 30 seconds and 10 minutes
			expect(challenge.timeLimit).toBeGreaterThanOrEqual(30);
			expect(challenge.timeLimit).toBeLessThanOrEqual(600);
		}
	});
});

describe('getChallengeById', () => {
	it('returns challenge for valid ID', () => {
		const firstChallenge = CHALLENGES[0];
		const found = getChallengeById(firstChallenge.id);
		expect(found).toBeDefined();
		expect(found?.id).toBe(firstChallenge.id);
	});

	it('returns undefined for invalid ID', () => {
		const found = getChallengeById('nonexistent-id');
		expect(found).toBeUndefined();
	});
});

describe('getShuffledChallenges', () => {
	it('returns default number of challenges', () => {
		const challenges = getShuffledChallenges();
		expect(challenges.length).toBe(GAME.DEFAULT_ROUNDS);
	});

	it('returns requested number of challenges', () => {
		const challenges = getShuffledChallenges(3);
		expect(challenges.length).toBe(3);
	});

	it('cycles challenges if count exceeds available', () => {
		const count = CHALLENGES.length + 2;
		const challenges = getShuffledChallenges(count);
		expect(challenges.length).toBe(count);
	});

	it('returns valid challenges', () => {
		const challenges = getShuffledChallenges();
		for (const challenge of challenges) {
			expect(challenge.id).toBeTruthy();
			expect(challenge.title).toBeTruthy();
		}
	});

	it('shuffles challenges (not always same order)', () => {
		// Run multiple times and check we don't always get the same first challenge
		const firstIds = new Set<string>();
		for (let i = 0; i < 20; i++) {
			const challenges = getShuffledChallenges();
			firstIds.add(challenges[0].id);
		}
		// With random shuffling, we should see more than 1 different first challenge
		// (unless there's only 1 challenge total)
		if (CHALLENGES.length > 1) {
			expect(firstIds.size).toBeGreaterThan(1);
		}
	});

	it('returns empty array for count of 0', () => {
		const challenges = getShuffledChallenges(0);
		expect(challenges).toEqual([]);
	});
});
