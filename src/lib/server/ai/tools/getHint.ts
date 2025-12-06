/**
 * Hint Tool
 *
 * Manages hint state - tracking usage and costs.
 * The chat AI generates the actual hint based on the state returned.
 */
import { tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../logger';
import type { GameTool, HintState } from './types';

const log = createLogger('HintTool');

/** Points deducted per hint */
export const HINT_COST = 50;

/** Maximum hints per challenge */
export const MAX_HINTS = 3;

/** Store for hints used per player per challenge */
const hintsUsed = new Map<string, number>();

function getHintKey(playerId: string, challengeId: string): string {
	return `${playerId}:${challengeId}`;
}

export function getHintsRemaining(playerId: string, challengeId: string): number {
	const key = getHintKey(playerId, challengeId);
	const used = hintsUsed.get(key) || 0;
	return Math.max(0, MAX_HINTS - used);
}

export function getHintCost(playerId: string, challengeId: string): number {
	const key = getHintKey(playerId, challengeId);
	const used = hintsUsed.get(key) || 0;
	return used * HINT_COST;
}

function useHint(playerId: string, challengeId: string): boolean {
	const key = getHintKey(playerId, challengeId);
	const used = hintsUsed.get(key) || 0;

	if (used >= MAX_HINTS) {
		return false;
	}

	hintsUsed.set(key, used + 1);
	return true;
}

export function resetHints(playerId: string): void {
	for (const key of hintsUsed.keys()) {
		if (key.startsWith(`${playerId}:`)) {
			hintsUsed.delete(key);
		}
	}
}

export function resetAllHints(): void {
	hintsUsed.clear();
}

/** Context needed to create the hint tool */
export interface HintToolContext {
	playerId: string;
	challengeId: string;
	referenceCode?: string;
	playerScore?: number;
}

/** Extended hint state with reference code */
export interface HintResult extends HintState {
	referenceCode?: string;
	insufficientScore?: boolean;
}

/**
 * Creates a hint tool with baked-in context.
 * The AI just calls get_hint() with no parameters.
 */
export function createHintTool(context: HintToolContext): GameTool {
	const { playerId, challengeId, referenceCode, playerScore = 0 } = context;

	return {
		name: 'get_hint',
		description: `Request a hint. Costs ${HINT_COST} points. Max ${MAX_HINTS} per challenge.`,
		costPoints: HINT_COST,
		tool: tool({
			description: `Use a hint for the current challenge. Call this when the user confirms they want a hint. Returns hint state including reference code - generate the actual hint based on the level.`,
			inputSchema: z.object({}),
			execute: async (): Promise<HintResult> => {
				// Check if player has enough score
				if (playerScore < HINT_COST) {
					log.info('Insufficient score for hint', { playerId, challengeId, playerScore });
					return {
						success: false,
						hintsUsed: MAX_HINTS - getHintsRemaining(playerId, challengeId),
						hintsRemaining: getHintsRemaining(playerId, challengeId),
						maxHints: MAX_HINTS,
						pointsCost: 0,
						hintLevel: null,
						guidance: `Player only has ${playerScore} points but hints cost ${HINT_COST}. Tell them they need to earn more points first.`,
						insufficientScore: true
					};
				}

				const remaining = getHintsRemaining(playerId, challengeId);
				const used = MAX_HINTS - remaining;

				if (remaining <= 0) {
					log.info('No hints remaining', { playerId, challengeId });
					return {
						success: false,
						hintsUsed: used,
						hintsRemaining: 0,
						maxHints: MAX_HINTS,
						pointsCost: 0,
						hintLevel: null,
						guidance: 'No hints remaining. Encourage the player to keep trying on their own.'
					};
				}

				// Use the hint
				useHint(playerId, challengeId);

				const hintLevel = used + 1;
				log.info('Hint used', { playerId, challengeId, hintLevel, remaining: remaining - 1 });

				return {
					success: true,
					hintsUsed: used + 1,
					hintsRemaining: remaining - 1,
					maxHints: MAX_HINTS,
					pointsCost: HINT_COST,
					hintLevel,
					guidance:
						hintLevel === 1
							? 'Give a VAGUE hint. Just point the general direction without specifics.'
							: hintLevel === 2
								? 'Give a SPECIFIC hint about what elements or patterns are needed.'
								: 'Give a DETAILED hint with implementation guidance, but not the solution.',
					referenceCode
				};
			}
		})
	};
}

// Keep legacy export for backwards compatibility during migration
export const getHintTool: GameTool = createHintTool({ playerId: 'default', challengeId: 'default' });
