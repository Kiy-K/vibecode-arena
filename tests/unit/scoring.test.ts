import { describe, it, expect } from 'vitest';
import {
	calculateScore,
	calculateTimeBonus,
	calculateEfficiencyBonus,
	calculatePositionBonus,
	getModelMultiplier,
	calculateHintPenalty,
	getHintsRemaining
} from '$lib/game/scoring';
import { SCORING } from '$lib/config/game';
import { ENABLED_MODEL_IDS } from '$lib/config/models';

describe('calculateScore', () => {
	const baseParams = {
		modelId: ENABLED_MODEL_IDS[0],
		timeTaken: 30000, // 30 seconds
		timeLimit: 300, // 5 minutes
		promptsUsed: 2,
		waitTime: 0,
		similarity: 100,
		passed: true,
		finishPosition: 0
	};

	it('returns base score for failed submission', () => {
		const score = calculateScore({
			...baseParams,
			passed: false,
			similarity: 50
		});
		// 50% similarity of base score
		const expectedBase = Math.round(SCORING.BASE * 0.5);
		expect(score).toBeGreaterThanOrEqual(expectedBase * 0.9);
		expect(score).toBeLessThanOrEqual(expectedBase * 1.5);
	});

	it('includes all bonuses for first place perfect pass', () => {
		const score = calculateScore({
			...baseParams,
			similarity: 100,
			promptsUsed: 0,
			finishPosition: 0
		});

		// Should be higher than base + position bonus
		const minExpected = SCORING.BASE + SCORING.POSITION_BONUSES[0];
		expect(score).toBeGreaterThanOrEqual(minExpected);
	});

	it('penalizes more prompts used', () => {
		const fewPrompts = calculateScore({ ...baseParams, promptsUsed: 1 });
		const manyPrompts = calculateScore({ ...baseParams, promptsUsed: 5 });

		expect(fewPrompts).toBeGreaterThan(manyPrompts);
	});

	it('rewards faster completion', () => {
		const fast = calculateScore({ ...baseParams, timeTaken: 10000 });
		const slow = calculateScore({ ...baseParams, timeTaken: 200000 });

		expect(fast).toBeGreaterThan(slow);
	});

	it('subtracts wait time from effective time', () => {
		// Same total time, but one had infrastructure wait
		const withWait = calculateScore({
			...baseParams,
			timeTaken: 60000,
			waitTime: 30000
		});
		const withoutWait = calculateScore({
			...baseParams,
			timeTaken: 30000,
			waitTime: 0
		});

		// Both should have similar scores since effective time is the same
		expect(Math.abs(withWait - withoutWait)).toBeLessThan(50);
	});

	it('applies model multiplier', () => {
		// If we have models with different multipliers, test them
		const multiplier1 = getModelMultiplier(ENABLED_MODEL_IDS[0]);
		if (ENABLED_MODEL_IDS.length > 1) {
			const multiplier2 = getModelMultiplier(ENABLED_MODEL_IDS[1]);
			if (multiplier1 !== multiplier2) {
				const score1 = calculateScore({
					...baseParams,
					modelId: ENABLED_MODEL_IDS[0]
				});
				const score2 = calculateScore({
					...baseParams,
					modelId: ENABLED_MODEL_IDS[1]
				});
				// Scores should differ by approximately the multiplier ratio
				const ratio = multiplier2 / multiplier1;
				expect(score2 / score1).toBeCloseTo(ratio, 0);
			}
		}
	});

	it('never returns negative score', () => {
		const worstCase = calculateScore({
			...baseParams,
			similarity: 0,
			passed: false,
			promptsUsed: 100
		});

		expect(worstCase).toBeGreaterThanOrEqual(0);
	});
});

describe('calculateTimeBonus', () => {
	it('returns max bonus for instant completion', () => {
		const bonus = calculateTimeBonus(0, 300000);
		expect(bonus).toBe(SCORING.TIME_BONUS_MAX);
	});

	it('returns zero bonus at time limit', () => {
		const bonus = calculateTimeBonus(300000, 300000);
		expect(bonus).toBe(0);
	});

	it('returns zero bonus after time limit', () => {
		const bonus = calculateTimeBonus(400000, 300000);
		expect(bonus).toBe(0);
	});

	it('returns half bonus at half time', () => {
		const bonus = calculateTimeBonus(150000, 300000);
		expect(bonus).toBe(Math.round(SCORING.TIME_BONUS_MAX * 0.5));
	});

	it('handles zero time limit', () => {
		const bonus = calculateTimeBonus(10000, 0);
		expect(bonus).toBe(0);
	});
});

describe('calculateEfficiencyBonus', () => {
	it('returns max bonus for zero prompts', () => {
		const bonus = calculateEfficiencyBonus(0);
		expect(bonus).toBe(SCORING.EFFICIENCY_BONUS_MAX);
	});

	it('decreases with more prompts', () => {
		const bonus1 = calculateEfficiencyBonus(1);
		const bonus2 = calculateEfficiencyBonus(2);
		const bonus3 = calculateEfficiencyBonus(3);

		expect(bonus1).toBeGreaterThan(bonus2);
		expect(bonus2).toBeGreaterThan(bonus3);
	});

	it('never goes negative', () => {
		const bonus = calculateEfficiencyBonus(100);
		expect(bonus).toBe(0);
	});

	it('decreases by penalty per prompt', () => {
		const bonus0 = calculateEfficiencyBonus(0);
		const bonus1 = calculateEfficiencyBonus(1);

		expect(bonus0 - bonus1).toBe(SCORING.EFFICIENCY_PENALTY_PER_PROMPT);
	});
});

describe('calculatePositionBonus', () => {
	it('returns first place bonus for position 0', () => {
		const bonus = calculatePositionBonus(0);
		expect(bonus).toBe(SCORING.POSITION_BONUSES[0]);
	});

	it('returns second place bonus for position 1', () => {
		const bonus = calculatePositionBonus(1);
		expect(bonus).toBe(SCORING.POSITION_BONUSES[1]);
	});

	it('returns third place bonus for position 2', () => {
		const bonus = calculatePositionBonus(2);
		expect(bonus).toBe(SCORING.POSITION_BONUSES[2]);
	});

	it('returns zero for positions beyond third', () => {
		expect(calculatePositionBonus(3)).toBe(0);
		expect(calculatePositionBonus(10)).toBe(0);
	});

	it('has descending bonuses', () => {
		expect(calculatePositionBonus(0)).toBeGreaterThan(calculatePositionBonus(1));
		expect(calculatePositionBonus(1)).toBeGreaterThan(calculatePositionBonus(2));
		expect(calculatePositionBonus(2)).toBeGreaterThan(calculatePositionBonus(3));
	});
});

describe('getModelMultiplier', () => {
	it('returns a number for all enabled models', () => {
		for (const modelId of ENABLED_MODEL_IDS) {
			const multiplier = getModelMultiplier(modelId);
			expect(typeof multiplier).toBe('number');
			expect(multiplier).toBeGreaterThan(0);
		}
	});

	it('returns 1.0 for unknown model', () => {
		const multiplier = getModelMultiplier('unknown/model' as any);
		expect(multiplier).toBe(1.0);
	});
});

describe('calculateHintPenalty', () => {
	it('returns zero for no hints', () => {
		expect(calculateHintPenalty(0)).toBe(0);
	});

	it('returns correct penalty for hints used', () => {
		expect(calculateHintPenalty(1)).toBe(SCORING.HINT_COST);
		expect(calculateHintPenalty(2)).toBe(SCORING.HINT_COST * 2);
		expect(calculateHintPenalty(3)).toBe(SCORING.HINT_COST * 3);
	});
});

describe('getHintsRemaining', () => {
	it('returns max hints for zero used', () => {
		expect(getHintsRemaining(0)).toBe(SCORING.MAX_HINTS);
	});

	it('decreases with hints used', () => {
		expect(getHintsRemaining(1)).toBe(SCORING.MAX_HINTS - 1);
		expect(getHintsRemaining(2)).toBe(SCORING.MAX_HINTS - 2);
	});

	it('never goes negative', () => {
		expect(getHintsRemaining(100)).toBe(0);
	});
});
