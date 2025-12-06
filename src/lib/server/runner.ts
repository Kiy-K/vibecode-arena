/**
 * Code runner service.
 * Handles code execution and multi-agent LLM-based scoring.
 */
import type { Challenge, SubmissionResult } from '$lib/types/game';

import { judgeSubmission } from './ai/agents';
import { createLogger } from './logger';
import { SandboxManager, waitForHMR } from './e2b';

// Re-export for backwards compatibility
export { startRoomSandbox, previewCode } from './e2b';

const log = createLogger('Runner');

// ============================================================================
// Constants
// ============================================================================

/** Minimum score to pass a challenge */
const PASS_THRESHOLD = 70;

// ============================================================================
// Code Execution
// ============================================================================

/**
 * Run and score player's code submission.
 * Writes code to sandbox, waits for HMR, then scores against reference.
 */
export async function runCode(
	code: string,
	challenge: Challenge,
	playerId: string,
	roomId: string
): Promise<SubmissionResult> {
	const emitLog = (msg: string) => SandboxManager.emitLog(playerId, msg);

	try {
		emitLog('Running code...');

		// Write player's code to sandbox
		await SandboxManager.updatePlayerCode(roomId, playerId, code);
		const sandboxUrl = SandboxManager.getPlayerUrl(roomId, playerId);

		// Wait for HMR to update
		await waitForHMR();

		// Score the submission using multi-agent judging
		emitLog('Analyzing with multi-agent system...');
		const judgingResult = await judgeSubmission({
			referenceCode: challenge.referenceCode,
			submissionCode: code,
			challengeTitle: challenge.title
		}).catch((err) => {
			log.error('Multi-agent scoring failed', { playerId, error: String(err) });
			emitLog(`Analysis error: ${err}`);
			return { finalScore: 0, feedback: 'Analysis failed', breakdown: null };
		});

		const result = {
			score: judgingResult.finalScore,
			feedback: judgingResult.feedback
		};

		// Log agent breakdown for debugging
		if (judgingResult.breakdown) {
			log.debug('Agent breakdown', {
				playerId,
				codeAnalysis: judgingResult.breakdown.codeAnalysis?.score,
				visualMatching: judgingResult.breakdown.visualMatching?.score,
				interactionTesting: judgingResult.breakdown.interactionTesting?.score
			});
		}

		const passed = result.score >= PASS_THRESHOLD;
		emitLog(`Score: ${result.score}/100 - ${passed ? 'PASSED' : 'FAILED'}`);

		return {
			passed,
			score: result.score,
			maxScore: 100,
			feedback: result.feedback,
			sandboxUrl: `${sandboxUrl}&t=${Date.now()}`
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		log.error('Code execution failed', { playerId, roomId, error: message });
		emitLog(`ERROR: ${message}`);

		return {
			passed: false,
			score: 0,
			maxScore: 100,
			feedback: 'Something went wrong. Please try again.',
			error: message
		};
	}
}
