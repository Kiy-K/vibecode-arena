/**
 * VisualMatcher Agent
 *
 * Analyzes visual similarity between reference and submission.
 * Focuses on UI elements, styling, and visual appearance.
 */

import type { AgentAnalysis, JudgeAgent, JudgingContext } from './types';

import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { env } from '../../env';
import { createLogger } from '../../logger';
import { VISUAL_MATCHER_SYSTEM, getVisualMatcherPrompt } from '../prompts';

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================
const CONFIG = {
	/** Agent identifier */
	NAME: 'VisualMatcher',
	/** Model to use - Gemini Flash for speed (still good at code comparison) */
	MODEL: 'google/gemini-2.0-flash-001',
	/** Maximum tokens for response */
	MAX_OUTPUT_TOKENS: 300,
	/** Weight in final score calculation (0-1) - highest as this is a UI competition */
	WEIGHT: 0.45,
	/** Default score when analysis fails */
	FALLBACK_SCORE: 50,
	/** Default confidence when analysis fails */
	FALLBACK_CONFIDENCE: 0.5
} as const;
// =============================================================================

const log = createLogger('VisualMatcherAgent');
const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

export class VisualMatcherAgent implements JudgeAgent {
	name = CONFIG.NAME;
	weight = CONFIG.WEIGHT;

	async analyze(context: JudgingContext): Promise<AgentAnalysis> {
		try {
			const { text } = await generateText({
				model: openrouter(CONFIG.MODEL),
				system: VISUAL_MATCHER_SYSTEM,
				prompt: getVisualMatcherPrompt(context.referenceCode, context.submissionCode),
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
