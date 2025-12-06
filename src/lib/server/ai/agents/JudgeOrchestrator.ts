/**
 * Judge Orchestrator
 *
 * Coordinates specialized analysis agents and synthesizes results.
 * Optimized for speed with caching, early rejection, and no orchestrator LLM call.
 */

import type { AgentAnalysis, JudgeAgent, JudgingContext, JudgingResult } from './types';

import { createLogger } from '../../logger';
import { CodeAnalyzerAgent } from './CodeAnalyzerAgent';
import { InteractionTesterAgent } from './InteractionTesterAgent';
import { VisualMatcherAgent } from './VisualMatcherAgent';

// =============================================================================
// CONFIGURATION
// =============================================================================
const CONFIG = {
	/** Weights for final score calculation */
	WEIGHTS: {
		CodeAnalyzer: 0.25,
		VisualMatcher: 0.5,
		InteractionTester: 0.25
	} as Record<string, number>,
	/** Default score for failures */
	FALLBACK_SCORE: 50,
	/** Cache TTL in ms (5 minutes) */
	CACHE_TTL_MS: 5 * 60 * 1000,
	/** Max cache entries */
	CACHE_MAX_SIZE: 100
};
// =============================================================================

const log = createLogger('JudgeOrchestrator');

/** Specialized analysis agents */
const agents: JudgeAgent[] = [
	new CodeAnalyzerAgent(),
	new VisualMatcherAgent(),
	new InteractionTesterAgent()
];

// =============================================================================
// RESULT CACHING
// =============================================================================

interface CacheEntry {
	result: JudgingResult;
	timestamp: number;
}

/** Simple LRU-ish cache for submission results */
const resultCache = new Map<string, CacheEntry>();

/** Create cache key from code pair */
function getCacheKey(referenceCode: string, submissionCode: string): string {
	// Simple hash - combine lengths and first/last chars for fast key
	const refHash = `${referenceCode.length}:${referenceCode.slice(0, 50)}:${referenceCode.slice(-50)}`;
	const subHash = `${submissionCode.length}:${submissionCode.slice(0, 50)}:${submissionCode.slice(-50)}`;
	return `${refHash}|${subHash}`;
}

/** Get cached result if valid */
function getCached(key: string): JudgingResult | null {
	const entry = resultCache.get(key);
	if (!entry) return null;

	if (Date.now() - entry.timestamp > CONFIG.CACHE_TTL_MS) {
		resultCache.delete(key);
		return null;
	}

	return entry.result;
}

/** Cache a result */
function setCache(key: string, result: JudgingResult): void {
	// Evict oldest if at capacity
	if (resultCache.size >= CONFIG.CACHE_MAX_SIZE) {
		const firstKey = resultCache.keys().next().value;
		if (firstKey) resultCache.delete(firstKey);
	}

	resultCache.set(key, { result, timestamp: Date.now() });
}

// =============================================================================
// EARLY REJECTION
// =============================================================================

/** Check if code is trivially invalid/empty */
function isInvalidSubmission(code: string): { invalid: boolean; reason?: string } {
	const trimmed = code.trim();

	// Empty or nearly empty
	if (trimmed.length < 10) {
		return { invalid: true, reason: 'Submission is empty or too short.' };
	}

	// Just a comment
	if (trimmed.startsWith('<!--') && trimmed.endsWith('-->') && !trimmed.includes('<')) {
		return { invalid: true, reason: 'Submission contains only comments.' };
	}

	// No actual content (just whitespace/newlines after stripping comments)
	const withoutComments = trimmed.replace(/<!--[\s\S]*?-->/g, '').trim();
	if (withoutComments.length < 5) {
		return { invalid: true, reason: 'Submission has no meaningful content.' };
	}

	return { invalid: false };
}

// =============================================================================
// MAIN JUDGE FUNCTION
// =============================================================================

/**
 * Judge a submission against reference code.
 * Uses parallel agents and weighted average (no orchestrator LLM call).
 */
export async function judgeSubmission(context: JudgingContext): Promise<JudgingResult> {
	const startTime = Date.now();

	// Check cache first
	const cacheKey = getCacheKey(context.referenceCode, context.submissionCode);
	const cached = getCached(cacheKey);
	if (cached) {
		log.info('Cache hit for submission', { durationMs: Date.now() - startTime });
		return cached;
	}

	// Early rejection for invalid submissions
	const validation = isInvalidSubmission(context.submissionCode);
	if (validation.invalid) {
		log.info('Early rejection', { reason: validation.reason });
		const result: JudgingResult = {
			finalScore: 0,
			feedback: validation.reason || 'Invalid submission.',
			breakdown: {
				codeAnalysis: createEmptyAnalysis('CodeAnalyzer'),
				visualMatching: createEmptyAnalysis('VisualMatcher'),
				interactionTesting: createEmptyAnalysis('InteractionTester')
			},
			aggregationMethod: 'early_rejection'
		};
		setCache(cacheKey, result);
		return result;
	}

	log.info('Starting multi-agent judging', {
		referenceLength: context.referenceCode.length,
		submissionLength: context.submissionCode.length
	});

	// Run all agents in parallel
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
					score: CONFIG.FALLBACK_SCORE,
					confidence: 0,
					findings: ['Analysis failed - using neutral score']
				} as AgentAnalysis;
			}
		})
	);

	// Build result map
	const resultMap = new Map<string, AgentAnalysis>();
	for (const result of agentResults) {
		resultMap.set(result.agentName, result);
	}

	// Calculate weighted average directly (no orchestrator LLM call)
	let weightedSum = 0;
	let totalWeight = 0;
	const feedbackParts: string[] = [];

	for (const result of agentResults) {
		const baseWeight = CONFIG.WEIGHTS[result.agentName] ?? 0.33;
		const weight = baseWeight * Math.max(0.1, result.confidence); // Min 10% confidence
		weightedSum += result.score * weight;
		totalWeight += weight;

		// Collect first finding from each agent for feedback
		if (result.findings.length > 0) {
			feedbackParts.push(result.findings[0]);
		}
	}

	const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : CONFIG.FALLBACK_SCORE;
	const feedback = feedbackParts.join(' ') || 'Analysis complete.';

	const duration = Date.now() - startTime;
	log.info('Multi-agent judging complete', {
		finalScore,
		durationMs: duration,
		agentScores: agentResults.map((r) => ({ name: r.agentName, score: r.score }))
	});

	const result: JudgingResult = {
		finalScore,
		feedback,
		breakdown: {
			codeAnalysis: resultMap.get('CodeAnalyzer') || createEmptyAnalysis('CodeAnalyzer'),
			visualMatching: resultMap.get('VisualMatcher') || createEmptyAnalysis('VisualMatcher'),
			interactionTesting: resultMap.get('InteractionTester') || createEmptyAnalysis('InteractionTester')
		},
		aggregationMethod: 'weighted_average'
	};

	// Cache the result
	setCache(cacheKey, result);

	return result;
}

/** Create empty analysis for missing agents */
function createEmptyAnalysis(agentName: string): AgentAnalysis {
	return {
		agentName,
		score: 0,
		confidence: 0,
		findings: ['Agent did not run']
	};
}
