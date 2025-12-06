/**
 * CodeAnalyzer Agent
 *
 * Analyzes code structure, syntax, and patterns.
 * Compares structural elements between reference and submission.
 */
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { env } from '../../env';
import { createLogger } from '../../logger';
import { CODE_ANALYZER_SYSTEM, getCodeAnalyzerPrompt } from '../prompts';
import type { AgentAnalysis, JudgeAgent, JudgingContext } from './types';

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================
const CONFIG = {
	/** Agent identifier */
	NAME: 'CodeAnalyzer',
	/** Model to use for analysis */
	MODEL: 'anthropic/claude-sonnet-4',
	/** Maximum tokens for response */
	MAX_OUTPUT_TOKENS: 500,
	/** Weight in final score calculation (0-1) */
	WEIGHT: 0.3,
	/** Default score when analysis fails */
	FALLBACK_SCORE: 50,
	/** Default confidence when analysis fails */
	FALLBACK_CONFIDENCE: 0.5
} as const;
// =============================================================================

const log = createLogger('CodeAnalyzerAgent');
const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

export class CodeAnalyzerAgent implements JudgeAgent {
	name = CONFIG.NAME;
	weight = CONFIG.WEIGHT;

	async analyze(context: JudgingContext): Promise<AgentAnalysis> {
		try {
			const { text } = await generateText({
				model: openrouter(CONFIG.MODEL),
				system: CODE_ANALYZER_SYSTEM,
				prompt: getCodeAnalyzerPrompt(context.referenceCode, context.submissionCode),
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
