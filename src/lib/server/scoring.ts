import type { Player, Room } from '$lib/types/game';
import { MODELS } from '$lib/config/models';
import { getHintCost } from './ai/tools';

/**
 * Scoring System
 *
 * Partial Credit: Points scale with similarity (0-100%)
 * Base Score:     Up to 1000 points based on similarity
 * Time Bonus:     0-150 points (faster = more) - only if passed
 * Efficiency:     0-200 points (fewer prompts = more) - only if passed
 * Position Bonus: 1st: 250, 2nd: 150, 3rd: 50 - only if passed
 * Hint Penalty:   -50 points per hint used
 * Model Multiplier: Harder models = more points
 *
 * Examples:
 * - 90% similarity + fast + 1st place = ~1400 pts
 * - 70% similarity (just passed) = ~700 pts + bonuses
 * - 50% similarity (failed) = ~500 pts (no bonuses)
 * - 20% similarity = ~200 pts
 * - 0% similarity = 0 pts
 */

const BASE_SCORE = 1000;
const TIME_BONUS_MAX = 150;
const EFFICIENCY_BONUS_MAX = 200;
const EFFICIENCY_PENALTY_PER_PROMPT = 40;
const POSITION_BONUSES = [250, 150, 50] as const;

export function calculateScore(
	player: Player,
	room: Room,
	timeTaken: number,
	promptsUsed: number,
	waitTimeMs: number = 0,
	similarityScore: number = 100,
	passed: boolean = true
): number {
	const modelMultiplier = MODELS.find((m) => m.id === player.model)?.multiplier ?? 1.0;
	const challengeId = room.currentChallenge?.id || 'unknown';

	// Base score scales with similarity (0-100%)
	const similarityRatio = similarityScore / 100;
	const baseScore = Math.round(BASE_SCORE * similarityRatio);

	// Bonuses only apply if you passed
	let bonuses = 0;
	if (passed) {
		const timeLimit = (room.currentChallenge?.timeLimit ?? 300) * 1000;
		const effectiveTime = Math.max(0, timeTaken - waitTimeMs);
		const timeRatio = effectiveTime / timeLimit;
		const position = room.players.filter((p) => p.passed).length;

		const timeBonus = Math.max(0, TIME_BONUS_MAX * (1 - timeRatio));
		const efficiencyBonus = Math.max(0, EFFICIENCY_BONUS_MAX - promptsUsed * EFFICIENCY_PENALTY_PER_PROMPT);
		const positionBonus = POSITION_BONUSES[position] ?? 0;

		bonuses = timeBonus + efficiencyBonus + positionBonus;
	}

	// Apply hint penalty (hints cost points regardless of pass/fail)
	const hintPenalty = getHintCost(player.id, challengeId);

	const rawScore = Math.max(0, baseScore + bonuses - hintPenalty);
	const finalScore = Math.round(rawScore * modelMultiplier);

	return finalScore;
}
