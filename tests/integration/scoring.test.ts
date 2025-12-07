import { describe, it, expect } from 'vitest';
import { SCORING, GAME } from '$lib/config/game';

// Test scoring calculations that would happen on the server
describe('Scoring Calculations', () => {
	describe('score bounds', () => {
		it('minimum possible score is positive after max hints', () => {
			const minScore = SCORING.BASE - SCORING.MAX_HINTS * SCORING.HINT_COST;
			expect(minScore).toBeGreaterThan(0);
		});

		it('maximum possible score includes all bonuses', () => {
			const maxScore =
				SCORING.BASE +
				SCORING.TIME_BONUS_MAX +
				SCORING.EFFICIENCY_BONUS_MAX +
				SCORING.POSITION_BONUSES[0];
			expect(maxScore).toBe(1600);
		});

		it('first place bonus is highest', () => {
			expect(SCORING.POSITION_BONUSES[0]).toBeGreaterThan(SCORING.POSITION_BONUSES[1]);
			expect(SCORING.POSITION_BONUSES[1]).toBeGreaterThan(SCORING.POSITION_BONUSES[2]);
		});
	});

	describe('efficiency scoring', () => {
		function calculateEfficiencyBonus(promptsUsed: number): number {
			// Efficiency bonus decreases with more prompts used
			const penalty = promptsUsed * SCORING.EFFICIENCY_PENALTY_PER_PROMPT;
			return Math.max(0, SCORING.EFFICIENCY_BONUS_MAX - penalty);
		}

		it('zero prompts gives max bonus', () => {
			expect(calculateEfficiencyBonus(0)).toBe(SCORING.EFFICIENCY_BONUS_MAX);
		});

		it('max prompts before zero bonus', () => {
			const maxPromptsForBonus = Math.floor(
				SCORING.EFFICIENCY_BONUS_MAX / SCORING.EFFICIENCY_PENALTY_PER_PROMPT
			);
			expect(calculateEfficiencyBonus(maxPromptsForBonus)).toBe(0);
		});

		it('never goes negative', () => {
			expect(calculateEfficiencyBonus(100)).toBe(0);
		});
	});

	describe('hint system', () => {
		it('total hint cost is less than base score', () => {
			const totalHintCost = SCORING.MAX_HINTS * SCORING.HINT_COST;
			expect(totalHintCost).toBeLessThan(SCORING.BASE);
		});

		it('using all hints still allows positive score', () => {
			const scoreAfterAllHints = SCORING.BASE - SCORING.MAX_HINTS * SCORING.HINT_COST;
			expect(scoreAfterAllHints).toBeGreaterThan(0);
		});
	});
});

describe('Game Rules', () => {
	it('allows single player games', () => {
		expect(GAME.MIN_PLAYERS).toBe(1);
	});

	it('has reasonable player limit', () => {
		expect(GAME.MAX_PLAYERS).toBeLessThanOrEqual(20);
		expect(GAME.MAX_PLAYERS).toBeGreaterThanOrEqual(2);
	});

	it('default rounds is reasonable', () => {
		expect(GAME.DEFAULT_ROUNDS).toBeGreaterThanOrEqual(3);
		expect(GAME.DEFAULT_ROUNDS).toBeLessThanOrEqual(10);
	});

	it('position bonuses exist for top 3', () => {
		expect(SCORING.POSITION_BONUSES.length).toBeGreaterThanOrEqual(3);
	});
});

describe('Leaderboard Calculations', () => {
	interface Player {
		id: string;
		name: string;
		score: number;
		roundScores: number[];
	}

	function calculateLeaderboard(players: Player[]): Player[] {
		return [...players].sort((a, b) => b.score - a.score);
	}

	function getRank(playerId: string, leaderboard: Player[]): number {
		return leaderboard.findIndex((p) => p.id === playerId) + 1;
	}

	it('sorts players by score descending', () => {
		const players: Player[] = [
			{ id: '1', name: 'Low', score: 100, roundScores: [] },
			{ id: '2', name: 'High', score: 500, roundScores: [] },
			{ id: '3', name: 'Mid', score: 300, roundScores: [] }
		];

		const leaderboard = calculateLeaderboard(players);

		expect(leaderboard[0].id).toBe('2');
		expect(leaderboard[1].id).toBe('3');
		expect(leaderboard[2].id).toBe('1');
	});

	it('returns correct rank for player', () => {
		const players: Player[] = [
			{ id: '1', name: 'First', score: 1000, roundScores: [] },
			{ id: '2', name: 'Second', score: 800, roundScores: [] },
			{ id: '3', name: 'Third', score: 600, roundScores: [] }
		];

		const leaderboard = calculateLeaderboard(players);

		expect(getRank('1', leaderboard)).toBe(1);
		expect(getRank('2', leaderboard)).toBe(2);
		expect(getRank('3', leaderboard)).toBe(3);
	});

	it('handles tied scores', () => {
		const players: Player[] = [
			{ id: '1', name: 'TieA', score: 500, roundScores: [] },
			{ id: '2', name: 'TieB', score: 500, roundScores: [] }
		];

		const leaderboard = calculateLeaderboard(players);

		// Both should be on leaderboard
		expect(leaderboard).toHaveLength(2);
		expect(leaderboard[0].score).toBe(500);
		expect(leaderboard[1].score).toBe(500);
	});
});
