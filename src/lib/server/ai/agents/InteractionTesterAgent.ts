/**
 * InteractionTester Agent
 *
 * Analyzes interactive behavior patterns.
 * Focuses on event handlers, state changes, and user interactions.
 */
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { env } from '../../env';
import { createLogger } from '../../logger';
import { INTERACTION_TESTER_SYSTEM, getInteractionTesterPrompt } from '../prompts';
import type { AgentAnalysis, JudgeAgent, JudgingContext } from './types';

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================
const CONFIG = {
	/** Agent identifier */
	NAME: 'InteractionTester',
	/** Model to use - Gemini Flash for speed */
	MODEL: 'google/gemini-2.0-flash-001',
	/** Maximum tokens for response */
	MAX_OUTPUT_TOKENS: 300,
	/** Weight in final score calculation (0-1) */
	WEIGHT: 0.25,
	/** Default score when analysis fails */
	FALLBACK_SCORE: 50,
	/** Default confidence when analysis fails */
	FALLBACK_CONFIDENCE: 0.5
} as const;
// =============================================================================

const log = createLogger('InteractionTesterAgent');
const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

export class InteractionTesterAgent implements JudgeAgent {
	name = CONFIG.NAME;
	weight = CONFIG.WEIGHT;

	async analyze(context: JudgingContext): Promise<AgentAnalysis> {
		try {
			const { text } = await generateText({
				model: openrouter(CONFIG.MODEL),
				system: INTERACTION_TESTER_SYSTEM,
				prompt: getInteractionTesterPrompt(context.referenceCode, context.submissionCode),
				maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS
			});

			const match = text.match(/\{[\s\S]*\}/);
			if (!match) {
				log.warn('Could not extract JSON from response');
				return {
					agentName: this.name,
					score: CONFIG.FALLBACK_SCORE,
					confidence: CONFIG.FALLBACK_CONFIDENCE,
					findings: ['Could not extract analysis results from AI response.'],
					details: {}
				};
			}

			const parsed = JSON.parse(match[0]);

			return {
				agentName: this.name,
				score: Math.max(0, Math.min(100, parsed.score ?? CONFIG.FALLBACK_SCORE)),
				confidence: Math.max(0, Math.min(1, parsed.confidence ?? CONFIG.FALLBACK_CONFIDENCE)),
				findings: Array.isArray(parsed.findings) ? parsed.findings : [],
				details: parsed.details
			};
		} catch (error) {
			log.error('Analysis failed', { error: String(error) });
			return {
				agentName: this.name,
				score: CONFIG.FALLBACK_SCORE,
				confidence: CONFIG.FALLBACK_CONFIDENCE,
				findings: ['Analysis failed due to an error.'],
				details: {}
			};
		}
	}
}
