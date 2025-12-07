/**
 * Scoring calculations for the game.
 * Extracted from GameRoom DO for testability.
 */
import { SCORING } from '$lib/config/game';
import { MODELS, type ModelId } from '$lib/config/models';

export interface ScoreCalculationParams {
	modelId: ModelId;
	timeTaken: number;
	timeLimit: number;
	promptsUsed: number;
	waitTime: number;
	similarity: number;
	passed: boolean;
	finishPosition: number; // 0-indexed (0 = first, 1 = second, etc.)
}

/**
 * Calculate the score for a player's submission.
 *
 * Score components:
 * - Base score: Based on similarity percentage
 * - Time bonus: Faster completion = more points
 * - Efficiency bonus: Fewer prompts = more points
 * - Position bonus: First 3 to finish get bonus
 * - Model multiplier: Harder models get score multiplier
 */
export function calculateScore(params: ScoreCalculationParams): number {
	const {
		modelId,
		timeTaken,
		timeLimit,
		promptsUsed,
		waitTime,
		similarity,
		passed,
		finishPosition
	} = params;

	// Get model multiplier (harder models get higher multiplier)
	const multiplier = getModelMultiplier(modelId);

	// Base score from similarity (0-100%)
	const baseScore = Math.round(SCORING.BASE * (similarity / 100));

	// If didn't pass, just return base score with multiplier
	if (!passed) {
		return Math.round(baseScore * multiplier);
	}

	// Calculate effective time (subtract infrastructure wait time)
	const effectiveTime = Math.max(0, timeTaken - waitTime);

	// Time bonus: faster = more points (linear decay)
	const timeBonus = calculateTimeBonus(effectiveTime, timeLimit * 1000);

	// Efficiency bonus: fewer prompts = more points
	const efficiencyBonus = calculateEfficiencyBonus(promptsUsed);

	// Position bonus: 1st, 2nd, 3rd get bonus
	const positionBonus = calculatePositionBonus(finishPosition);

	// Total score with model multiplier
	const totalScore = baseScore + timeBonus + efficiencyBonus + positionBonus;
	return Math.round(totalScore * multiplier);
}

/**
 * Calculate time bonus based on completion speed.
 * Faster = more bonus, up to TIME_BONUS_MAX.
 */
export function calculateTimeBonus(effectiveTimeMs: number, timeLimitMs: number): number {
	if (timeLimitMs <= 0) return 0;
	const ratio = effectiveTimeMs / timeLimitMs;
	return Math.max(0, Math.round(SCORING.TIME_BONUS_MAX * (1 - ratio)));
}

/**
 * Calculate efficiency bonus based on prompts used.
 * Fewer prompts = more bonus.
 */
export function calculateEfficiencyBonus(promptsUsed: number): number {
	const penalty = promptsUsed * SCORING.EFFICIENCY_PENALTY_PER_PROMPT;
	return Math.max(0, SCORING.EFFICIENCY_BONUS_MAX - penalty);
}

/**
 * Calculate position bonus for finishing 1st, 2nd, or 3rd.
 */
export function calculatePositionBonus(position: number): number {
	return SCORING.POSITION_BONUSES[position] ?? 0;
}

/**
 * Get the score multiplier for a model.
 * Harder models have higher multipliers.
 */
export function getModelMultiplier(modelId: ModelId): number {
	return MODELS.find((m) => m.id === modelId)?.multiplier ?? 1.0;
}

/**
 * Calculate the total hint penalty for hints used.
 */
export function calculateHintPenalty(hintsUsed: number): number {
	return hintsUsed * SCORING.HINT_COST;
}

/**
 * Get remaining hints for a player.
 */
export function getHintsRemaining(hintsUsed: number): number {
	return Math.max(0, SCORING.MAX_HINTS - hintsUsed);
}
