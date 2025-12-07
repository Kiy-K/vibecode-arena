/**
 * Submission state hook.
 * Manages the code submission flow, result state, and celebration effects.
 *
 * Handles:
 * - Submitting code to the server
 * - Connecting to sandbox logs stream
 * - Tracking submission result and score
 * - Success celebration with confetti
 *
 * @example
 * ```ts
 * const submission = useSubmission({
 *   roomCode: 'ABC123',
 *   getChallenge: () => challenge,
 *   getCodeSource: () => codeSource,
 *   getTimeLeft: () => timer.timeLeft,
 *   stopTimer: () => timer.stop(),
 *   onSandboxUrl: (url) => sandbox.setUrl(url),
 *   onLog: (msg) => sandbox.addLog(msg)
 * });
 *
 * await submission.submit('player-1');
 * // submission.submitted is true
 * // submission.result contains pass/fail and score
 * ```
 */

import type { SubmissionResult, Challenge, PublicChallenge } from '$lib/types/game';
import { fireSuccessConfetti } from '$lib/utils/confetti';
import { submitCode } from '../../routes/[code]/game.remote';

/**
 * Source of code to submit (from chat message).
 */
export interface CodeSource {
	/** ID of the chat message containing the code */
	messageId: string;
	/** The extracted code content */
	code: string;
}

/**
 * Dependencies required by the submission hook.
 */
interface SubmissionDeps {
	/** Room code for API calls */
	roomCode: string;
	/** Get current challenge */
	getChallenge: () => Challenge | PublicChallenge | null;
	/** Get selected code source */
	getCodeSource: () => CodeSource | null;
	/** Get remaining time in seconds */
	getTimeLeft: () => number;
	/** Stop the game timer */
	stopTimer: () => void;
	/** Callback when sandbox URL is received */
	onSandboxUrl: (url: string) => void;
	/** Callback for sandbox log messages */
	onLog: (message: string) => void;
}

/**
 * Creates submission state management.
 *
 * @param deps - Dependencies for submission logic
 * @returns Submission state and controls
 */
export function useSubmission(deps: SubmissionDeps) {
	/** Whether a submission is in progress */
	let submitting = $state(false);
	/** Whether player has already submitted this round */
	let submitted = $state(false);
	/** Submission result from server */
	let result: SubmissionResult | null = $state(null);
	/** Points earned this round */
	let earnedScore = $state(0);
	/** Time taken to submit in seconds */
	let timeTaken = $state(0);
	/** Whether to show the success celebration modal */
	let showCelebration = $state(false);

	/** EventSource for streaming sandbox logs */
	let logsEventSource: EventSource | null = null;

	/**
	 * Submit the selected code for evaluation.
	 * Connects to sandbox logs stream and handles the submission flow.
	 *
	 * @param playerId - Current player's ID
	 */
	async function submit(playerId: string) {
		const codeSource = deps.getCodeSource();
		const challenge = deps.getChallenge();

		if (submitting || submitted || !codeSource || !challenge) return;

		submitting = true;

		// Freeze timer at submission time
		timeTaken = challenge.timeLimit - deps.getTimeLeft();
		deps.stopTimer();

		// Connect to sandbox logs stream
		const logsParams = new URLSearchParams({ playerId });
		logsEventSource = new EventSource(`/api/sandbox-logs?${logsParams.toString()}`);

		logsEventSource.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === 'log') {
					deps.onLog(msg.message);
					const urlMatch = msg.message.match(/Sandbox URL: (https:\/\/[^\s]+)/);
					if (urlMatch) {
						deps.onSandboxUrl(urlMatch[1]);
					}
				}
			} catch {
				// Ignore malformed JSON
			}
		};

		logsEventSource.onerror = () => {
			logsEventSource?.close();
			logsEventSource = null;
		};

		try {
			const response = await submitCode({
				roomCode: deps.roomCode,
				messageId: codeSource.messageId
			});

			result = response.result;

			if (response.result.sandboxUrl) {
				deps.onSandboxUrl(response.result.sandboxUrl);
			}

			submitted = true;
			earnedScore = response.roundScore;

			if (response.result.passed) {
				showCelebration = true;
				fireSuccessConfetti();
			}
		} catch (err) {
			console.error('Submit error:', err);
			deps.onLog(`ERROR: ${err}`);
		} finally {
			submitting = false;
			logsEventSource?.close();
			logsEventSource = null;
		}
	}

	/**
	 * Reset all submission state for a new round.
	 */
	function reset() {
		submitting = false;
		submitted = false;
		result = null;
		earnedScore = 0;
		timeTaken = 0;
		showCelebration = false;
		logsEventSource?.close();
		logsEventSource = null;
	}

	/**
	 * Close the success celebration modal.
	 */
	function closeCelebration() {
		showCelebration = false;
	}

	/**
	 * Cleanup function to close any open connections.
	 * Call this when the component is destroyed.
	 */
	function destroy() {
		logsEventSource?.close();
		logsEventSource = null;
	}

	return {
		/** Whether submission is in progress */
		get submitting() {
			return submitting;
		},
		/** Whether player has submitted this round */
		get submitted() {
			return submitted;
		},
		/** Allow external setting of submitted state (for resuming) */
		set submitted(v: boolean) {
			submitted = v;
		},
		/** Submission result (pass/fail, similarity, etc.) */
		get result() {
			return result;
		},
		/** Points earned this round */
		get earnedScore() {
			return earnedScore;
		},
		/** Time taken to submit in seconds */
		get timeTaken() {
			return timeTaken;
		},
		/** Whether celebration modal is visible */
		get showCelebration() {
			return showCelebration;
		},
		submit,
		reset,
		closeCelebration,
		destroy
	};
}
