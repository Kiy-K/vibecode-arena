/**
 * Types for the multi-agent judging system.
 */

/** Result from a specialized agent's analysis */
export interface AgentAnalysis {
	agentName: string;
	score: number; // 0-100
	confidence: number; // 0-1 (how confident the agent is in its assessment)
	findings: string[];
	details?: Record<string, unknown>;
}

/** Combined result from all agents */
export interface JudgingResult {
	finalScore: number;
	feedback: string;
	breakdown: {
		codeAnalysis: AgentAnalysis;
		visualMatching: AgentAnalysis;
		interactionTesting: AgentAnalysis;
	};
	aggregationMethod: 'weighted_average' | 'consensus' | 'minimum' | 'early_rejection';
}

/** Input context for agent analysis */
export interface JudgingContext {
	referenceCode: string;
	submissionCode: string;
	challengeTitle?: string;
	challengeDescription?: string;
}

/** Base interface for all specialized agents */
export interface JudgeAgent {
	name: string;
	weight: number; // Weight in final score calculation (0-1)
	analyze(context: JudgingContext): Promise<AgentAnalysis>;
}
