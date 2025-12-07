/**
 * Main game orchestration hook.
 * Composes sub-hooks for state management and coordinates game flow.
 */

import type {
	Room,
	PublicRoom,
	PublicPlayer,
	Challenge,
	PublicChallenge,
	SSEChallengeStarted,
	SSEPlayerSubmitted,
	SSEPlayerReady,
	SSERoundEnded,
	SSEGameEnded,
	SSEPlayerJoinedLeft,
	SSERoomSandboxReady,
	SSESandboxReady,
	SSESandboxLog,
	SSEWaitingForJudging,
	SSEJudgingStarted,
	SSEJudgingFinished,
	SSEPlayerScoreUpdated
} from '$lib/types/game';

import { useChat, type ChatMessage } from './useChat.svelte';
import { useTimer, formatTime } from './useTimer.svelte';
import { useCountdown } from './useCountdown.svelte';
import { useGameSocket, type GameEventHandlers } from './useGameSocket.svelte';
import { useSubmission, type CodeSource } from './useSubmission.svelte';
import { useReview } from './useReview.svelte';
import { useSandbox } from './useSandbox.svelte';

import { startRound, updatePreview } from '../../routes/[code]/game.remote';

// ============================================================================
// Types
// ============================================================================

export interface Submission {
	playerId: string;
	playerName: string;
	time: number;
}

export interface GameInit {
	room: PublicRoom;
	playerId: string;
	isHost: boolean;
	serverTime: number;
	chatHistory?: ChatMessage[];
	sandboxUrl?: string | null;
	sandboxReady?: boolean;
	wsUrl: string;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useGame(init: GameInit) {
	// -------------------------------------------------------------------------
	// Sub-hooks
	// -------------------------------------------------------------------------
	const timer = useTimer();
	const chat = useChat(init.chatHistory || []);
	const sandbox = useSandbox(init.sandboxUrl, init.sandboxReady);
	const review = useReview(init.room.code, init.playerId);
	const allSubmittedCountdown = useCountdown();

	const submission = useSubmission({
		roomCode: init.room.code,
		getChallenge: () => challenge,
		getCodeSource: () => codeSource,
		getTimeLeft: () => timer.timeLeft,
		stopTimer: () => timer.stop(),
		onSandboxUrl: (url) => sandbox.setUrl(url),
		onLog: (msg) => sandbox.addLog(msg)
	});

	// -------------------------------------------------------------------------
	// Core State
	// -------------------------------------------------------------------------
	let room = $state(init.room);
	let challenge: Challenge | PublicChallenge | null = $state(init.room.currentChallenge || null);
	let codeSource: CodeSource | null = $state(null);
	let submissions: Submission[] = $state([]);
	let mobileTab: 'challenge' | 'chat' | 'code' = $state('chat');

	// Judging state
	let waitingForJudging = $state(false);
	let judgingCount = $state(0);
	let judgingPlayerIds = $state(new Set<string>());

	// UI refs
	let textareaEl: HTMLTextAreaElement | null = null;
	let lastPreviewedMessageId = '';

	// -------------------------------------------------------------------------
	// Derived Values
	// -------------------------------------------------------------------------
	const player = $derived(room.players.find((p) => p.id === init.playerId));
	const activeCode = $derived(chat.streamingCode ?? (codeSource as CodeSource | null)?.code ?? '');

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------
	function calculateRemainingTime(): number {
		// Use server-calculated timeRemaining if available
		return room.timeRemaining ?? 0;
	}

	function resetRound() {
		codeSource = null;
		submissions = [];
		lastPreviewedMessageId = '';
		waitingForJudging = false;
		judgingCount = 0;
		judgingPlayerIds = new Set();

		submission.reset();
		review.reset();
		sandbox.reset();
		allSubmittedCountdown.reset();
		chat.reset();
	}

	function focusTextarea() {
		textareaEl?.focus();
	}

	// -------------------------------------------------------------------------
	// Event Handlers
	// -------------------------------------------------------------------------
	function handleChallengeStarted(data: SSEChallengeStarted) {
		// Reset round state FIRST to clear stale data
		resetRound();

		// Update room with fresh data from server (including reset player states)
		room = {
			...room,
			...data.room // Take all fields from server
		};
		challenge = data.challenge;
		timer.start(data.challenge.timeLimit);
		setTimeout(() => focusTextarea(), 100);
	}

	function handlePlayerSubmitted(data: SSEPlayerSubmitted) {
		const submittedPlayer = room.players.find((p) => p.id === data.playerId);

		if (data.passed && submittedPlayer) {
			submissions = [
				...submissions,
				{
					playerId: data.playerId,
					playerName: submittedPlayer.name,
					time: data.timeTaken || 0
				}
			];
		}

		room = {
			...room,
			players: room.players.map((p) =>
				p.id === data.playerId
					? {
							...p,
							passed: data.passed,
							hasSubmitted: true,
							score: data.score || p.score,
							roundScore: data.roundScore,
							sandboxUrl: data.sandboxUrl || p.sandboxUrl,
							screenshotUrl: data.screenshotUrl || p.screenshotUrl
						}
					: p
			)
		};

		// Check if all players have submitted
		const allHaveSubmitted = room.players.every((p) => p.hasSubmitted);
		if (allHaveSubmitted && !allSubmittedCountdown.isActive) {
			setTimeout(() => allSubmittedCountdown.start(5), 5000);
		}
	}

	function handleRoundEnded(data: SSERoundEnded) {
		// Update room status and use leaderboard for review
		room = {
			...room,
			status: data.room.status
		};
		timer.stop();
		submission.closeCelebration();
		// Use leaderboard which has PublicPlayer[] - pass to review
		review.start(data.leaderboard, data.reviewDuration || 10000);
	}

	function handleGameEnded(data: SSEGameEnded) {
		room = {
			...room,
			status: data.room.status
		};
		timer.stop();
		submission.closeCelebration();
	}

	function handlePlayerJoinedLeft(data: SSEPlayerJoinedLeft) {
		// Sync players from public room
		room = {
			...room,
			players: data.room.players
		};
	}

	function handleRoomSandboxReady(data: SSERoomSandboxReady) {
		sandbox.setReady(true);
		room = {
			...room,
			status: data.room.status
		};
	}

	function handleSandboxReady(data: SSESandboxReady) {
		// Now sent only to the specific player, so no need to check ID
		sandbox.setUrl(data.sandboxUrl);
	}

	function handleSandboxLog(data: SSESandboxLog) {
		sandbox.addLog(data.message);
	}

	function handleWaitingForJudging(data: SSEWaitingForJudging) {
		waitingForJudging = true;
		judgingCount = data.judgingCount;
	}

	function handleJudgingStarted(data: SSEJudgingStarted) {
		judgingCount = data.judgingCount;
		judgingPlayerIds = new Set([...judgingPlayerIds, data.playerId]);
	}

	function handleJudgingFinished(data: SSEJudgingFinished) {
		judgingCount = data.judgingCount;
		const newSet = new Set(judgingPlayerIds);
		newSet.delete(data.playerId);
		judgingPlayerIds = newSet;
		if (data.judgingCount === 0) {
			waitingForJudging = false;
		}
	}

	function handlePlayerScoreUpdated(data: SSEPlayerScoreUpdated) {
		room = {
			...room,
			players: room.players.map((p) => (p.id === data.playerId ? { ...p, score: data.score } : p))
		};
	}

	function handleJudgingComplete() {
		waitingForJudging = false;
		judgingCount = 0;
	}

	// -------------------------------------------------------------------------
	// WebSocket Setup
	// -------------------------------------------------------------------------
	const eventHandlers: GameEventHandlers = {
		challenge_started: (d) => handleChallengeStarted(d as SSEChallengeStarted),
		player_submitted: (d) => handlePlayerSubmitted(d as SSEPlayerSubmitted),
		player_ready: (d) => {
			const data = d as SSEPlayerReady;
			review.handlePlayerReady(data.playerId, data.readyCount);
		},
		round_ended: (d) => handleRoundEnded(d as SSERoundEnded),
		game_ended: (d) => handleGameEnded(d as SSEGameEnded),
		player_joined: (d) => handlePlayerJoinedLeft(d as SSEPlayerJoinedLeft),
		player_left: (d) => handlePlayerJoinedLeft(d as SSEPlayerJoinedLeft),
		room_sandbox_ready: (d) => handleRoomSandboxReady(d as SSERoomSandboxReady),
		sandbox_ready: (d) => handleSandboxReady(d as SSESandboxReady),
		sandbox_log: (d) => handleSandboxLog(d as SSESandboxLog),
		waiting_for_judging: (d) => handleWaitingForJudging(d as SSEWaitingForJudging),
		judging_started: (d) => handleJudgingStarted(d as SSEJudgingStarted),
		judging_finished: (d) => handleJudgingFinished(d as SSEJudgingFinished),
		player_score_updated: (d) => handlePlayerScoreUpdated(d as SSEPlayerScoreUpdated),
		judging_complete: () => handleJudgingComplete()
	};

	const socket = useGameSocket(init.wsUrl, eventHandlers);

	// -------------------------------------------------------------------------
	// Actions
	// -------------------------------------------------------------------------
	async function startGame() {
		await startRound(room.code);
	}

	async function submit() {
		await submission.submit(init.playerId);
	}

	async function sendChat(e: Event) {
		e.preventDefault();
		if (!challenge) return;

		const extracted = await chat.send({
			roomCode: room.code,
			playerId: init.playerId,
			model: player?.model,
			language: 'javascript'
		});

		if (extracted) codeSource = extracted;
	}

	function selectCode(messageId: string, code: string) {
		codeSource = { messageId, code };
	}

	function selectLastCode() {
		const lastCode = chat.findLastCode();
		if (lastCode && !submission.submitted) codeSource = lastCode;
	}

	function setMobileTab(tab: 'challenge' | 'chat' | 'code') {
		mobileTab = tab;
	}

	function setTextareaRef(el: HTMLTextAreaElement) {
		textareaEl = el;
	}

	// -------------------------------------------------------------------------
	// Keyboard Shortcuts
	// -------------------------------------------------------------------------
	function handleKeydown(e: KeyboardEvent) {
		const isMod = e.metaKey || e.ctrlKey;

		if (isMod && e.key === 'u') {
			e.preventDefault();
			selectLastCode();
		}

		if (isMod && e.key === 'Enter') {
			e.preventDefault();
			if (!submission.submitting && !submission.submitted && codeSource) submit();
		}

		if (e.key === 'Escape') {
			e.preventDefault();
			focusTextarea();
		}
	}

	// -------------------------------------------------------------------------
	// Effects
	// -------------------------------------------------------------------------

	// Trigger preview when complete code block detected during streaming
	$effect(() => {
		const streamingSource = chat.streamingCodeSource;
		if (
			streamingSource &&
			streamingSource.messageId !== lastPreviewedMessageId &&
			room.status === 'playing' &&
			!submission.submitting
		) {
			lastPreviewedMessageId = streamingSource.messageId;
			updatePreview({ roomCode: room.code, code: streamingSource.code })
				.then((res) => {
					if (res.sandboxUrl) sandbox.setUrl(res.sandboxUrl);
				})
				.catch(() => {});
		}
	});

	// Trigger preview when code is selected (fallback for non-streaming cases)
	$effect(() => {
		if (
			codeSource &&
			codeSource.messageId !== lastPreviewedMessageId &&
			!chat.loading &&
			room.status === 'playing' &&
			!submission.submitting
		) {
			lastPreviewedMessageId = codeSource.messageId;
			updatePreview({ roomCode: room.code, code: codeSource.code })
				.then((res) => {
					if (res.sandboxUrl) sandbox.setUrl(res.sandboxUrl);
				})
				.catch(() => {});
		}
	});

	// -------------------------------------------------------------------------
	// Setup
	// -------------------------------------------------------------------------
	function setup() {
		socket.start();
		window.addEventListener('keydown', handleKeydown);

		// Resume state if already playing
		if (room.status === 'playing') {
			const remaining = calculateRemainingTime();
			if (remaining > 0) timer.start(remaining);
			if (player?.hasSubmitted) submission.submitted = true;
			const lastCode = chat.findLastCode();
			if (lastCode) codeSource = lastCode;
			setTimeout(() => focusTextarea(), 100);
		}

		return () => {
			socket.stop();
			window.removeEventListener('keydown', handleKeydown);
			allSubmittedCountdown.stop();
			review.reset();
			submission.destroy();
		};
	}

	// -------------------------------------------------------------------------
	// Return API
	// -------------------------------------------------------------------------
	return {
		// Timer
		get timeLeft() {
			return timer.timeLeft;
		},
		formatTime,

		// Chat
		get messages() {
			return chat.messages;
		},
		get chatInput() {
			return chat.input;
		},
		set chatInput(v: string) {
			chat.input = v;
		},
		get chatLoading() {
			return chat.loading;
		},
		get promptsUsed() {
			return chat.promptsUsed;
		},

		// Game state
		get room() {
			return room;
		},
		get challenge() {
			return challenge;
		},
		get player() {
			return player;
		},
		get codeSource() {
			return codeSource;
		},
		get activeCode() {
			return activeCode;
		},

		// Submission
		get submitting() {
			return submission.submitting;
		},
		get submitted() {
			return submission.submitted;
		},
		get result() {
			return submission.result;
		},
		get earnedScore() {
			return submission.earnedScore;
		},
		get timeTaken() {
			return submission.timeTaken;
		},
		get showCelebration() {
			return submission.showCelebration;
		},

		// All submitted
		get allSubmitted() {
			return allSubmittedCountdown.isActive;
		},
		get allSubmittedCountdown() {
			return allSubmittedCountdown.value;
		},

		// Review
		get reviewCountdown() {
			return review.countdown;
		},
		get reviewPlayers() {
			return review.players;
		},
		get readyCount() {
			return review.readyCount;
		},
		get isReady() {
			return review.isReady;
		},
		get markingReady() {
			return review.markingReady;
		},

		// UI
		get submissions() {
			return submissions;
		},
		get mobileTab() {
			return mobileTab;
		},

		// Sandbox
		get sandboxLogs() {
			return sandbox.logs;
		},
		get sandboxUrl() {
			return sandbox.url;
		},
		get sandboxReady() {
			return sandbox.ready;
		},

		// Judging
		get waitingForJudging() {
			return waitingForJudging;
		},
		get judgingCount() {
			return judgingCount;
		},
		get judgingPlayerIds() {
			return judgingPlayerIds;
		},

		// Init props
		playerId: init.playerId,
		isHost: init.isHost,

		// Actions
		setup,
		startGame,
		submit,
		sendChat,
		selectCode,
		selectLastCode,
		continueToNextRound: review.continueToNextRound,
		closeCelebration: submission.closeCelebration,
		setMobileTab,
		setTextareaRef
	};
}

// Re-export for convenience
export type { CodeSource };
