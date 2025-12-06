/**
 * Judge Orchestrator Agent
 *
 * An AI agent that coordinates specialized analysis agents and
 * synthesizes their findings into a final judgment.
 */

import type { AgentAnalysis, JudgeAgent, JudgingContext, JudgingResult } from './types';

import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { env } from '../../env';
import { createLogger } from '../../logger';
import { getOrchestratorPrompt } from '../prompts';
import { CodeAnalyzerAgent } from './CodeAnalyzerAgent';
import { InteractionTesterAgent } from './InteractionTesterAgent';
import { VisualMatcherAgent } from './VisualMatcherAgent';

// =============================================================================
// ORCHESTRATOR CONFIGURATION
// =============================================================================
const CONFIG = {
	/** Model to use for final synthesis */
	MODEL: 'google/gemini-2.5-flash-preview-09-2025',
	/** Maximum tokens for orchestrator response */
	MAX_OUTPUT_TOKENS: 300,
	/** Default score when orchestrator fails */
	FALLBACK_SCORE: 50 as number,
	/** Fallback weights if orchestrator AI fails (used for weighted average) */
	FALLBACK_WEIGHTS: {
		CodeAnalyzer: 0.25,
		VisualMatcher: 0.5,
		InteractionTester: 0.25
	} as Record<string, number>
};
// =============================================================================

const log = createLogger('JudgeOrchestrator');
const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

/** Specialized analysis agents */
const agents: JudgeAgent[] = [
	new CodeAnalyzerAgent(),
	new VisualMatcherAgent(),
	new InteractionTesterAgent()
];

/**
 * Run all agents in parallel and have orchestrator AI synthesize results.
 */
export async function judgeSubmission(context: JudgingContext): Promise<JudgingResult> {
	log.info('Starting multi-agent judging', {
		referenceLength: context.referenceCode.length,
		submissionLength: context.submissionCode.length
	});

	const startTime = Date.now();

	// Run all specialized agents in parallel
	const agentResults = await Promise.all(
		agents.map(async (agent) => {
			const agentStart = Date.now();
			try {
				const result = await agent.analyze(context);
				log.debug(`${agent.name} completed`, {
					score: result.score,
					confidence: result.confidence,
					durationMs: Date.now() - agentStart
				});
				return result;
			} catch (error) {
				log.error(`${agent.name} failed`, { error: String(error) });
				return {
					agentName: agent.name,
					score: 50,
					confidence: 0,
					findings: ['Analysis failed - using neutral score']
				} as AgentAnalysis;
			}
		})
	);

	// Map results by agent name
	const resultMap = new Map<string, AgentAnalysis>();
	for (const result of agentResults) {
		resultMap.set(result.agentName, result);
	}

	// Orchestrator AI synthesizes the results
	let finalScore = CONFIG.FALLBACK_SCORE;
	let feedback = 'Analysis complete.';

	try {
		const { text } = await generateText({
			model: openrouter(CONFIG.MODEL),
			prompt: getOrchestratorPrompt(context.referenceCode, context.submissionCode, agentResults),
			maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS
		});

		const match = text.match(/\{[\s\S]*\}/);
		if (match) {
			const parsed = JSON.parse(match[0]);
			finalScore = Math.max(0, Math.min(100, Math.round(parsed.finalScore ?? CONFIG.FALLBACK_SCORE)));
			feedback = parsed.feedback || feedback;

			log.debug('Orchestrator reasoning', { reasoning: parsed.reasoning });
		}
	} catch (error) {
		log.error('Orchestrator synthesis failed, using weighted average', { error: String(error) });

		// Fallback: simple weighted average using configured weights
		let weightedSum = 0;
		let totalWeight = 0;

		for (const result of agentResults) {
			const weight = (CONFIG.FALLBACK_WEIGHTS[result.agentName] ?? 0.33) * result.confidence;
			weightedSum += result.score * weight;
			totalWeight += weight;
		}

		finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : CONFIG.FALLBACK_SCORE;
		feedback = agentResults.flatMap((r) => r.findings.slice(0, 1)).join(' ') || 'Analysis complete.';
	}

	const duration = Date.now() - startTime;
	log.info('Multi-agent judging complete', {
		finalScore,
		durationMs: duration,
		agentScores: agentResults.map((r) => ({ name: r.agentName, score: r.score }))
	});

	return {
		finalScore,
		feedback,
		breakdown: {
			codeAnalysis: resultMap.get('CodeAnalyzer') || createEmptyAnalysis('CodeAnalyzer'),
			visualMatching: resultMap.get('VisualMatcher') || createEmptyAnalysis('VisualMatcher'),
			interactionTesting: resultMap.get('InteractionTester') || createEmptyAnalysis('InteractionTester')
		},
		aggregationMethod: 'weighted_average'
	};
}

function createEmptyAnalysis(agentName: string): AgentAnalysis {
	return {
		agentName,
		score: 0,
		confidence: 0,
		findings: ['Agent did not run']
	};
}
