/**
 * Main game orchestration hook.
 * Combines state management, SSE events, keyboard shortcuts, and actions.
 */
import { onMount } from 'svelte';

import type {
	Room,
	Challenge,
	PublicChallenge,
	Player,
	SubmissionResult,
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
	SSEPlayerScoreUpdated,
	SSEJudgingComplete
} from '$lib/types/game';

import { useChat, type ChatMessage } from '$lib/hooks/useChat.svelte';
import { useTimer, formatTime } from '$lib/hooks/useTimer.svelte';
import { fireSuccessConfetti } from '$lib/utils/confetti';

import { startRound, submitCode, markReady, updatePreview } from '../../routes/[code]/game.remote';

export interface Submission {
	playerId: string;
	playerName: string;
	time: number;
}

export interface CodeSource {
	messageId: string;
	code: string;
}

export interface GameInit {
	room: Room;
	playerId: string;
	isHost: boolean;
	serverTime: number;
	chatHistory?: ChatMessage[];
	sandboxUrl?: string | null;
	sandboxReady?: boolean;
}

export function useGame(init: GameInit) {
	// Sub-hooks
	const timer = useTimer();
	const chat = useChat(init.chatHistory || []);

	// Core game state
	let room = $state(init.room);
	let challenge: Challenge | PublicChallenge | null = $state(init.room.currentChallenge || null);
	let codeSource: CodeSource | null = $state<CodeSource | null>(null);

	// Submission state
	let submitting = $state(false);
	let submitted = $state(false);
	let result: SubmissionResult | null = $state(null);
	let earnedScore = $state(0);
	let timeTaken = $state(0);
	let showCelebration = $state(false);

	// "All submitted" countdown state
	let allSubmitted = $state(false);
	let allSubmittedCountdown = $state(0);
	let allSubmittedIntervalRef: ReturnType<typeof setInterval> | null = null;

	// Review state
	let reviewCountdown = $state(0);
	let reviewIntervalRef: ReturnType<typeof setInterval> | null = null;
	let reviewPlayers: Player[] = $state([]);
	let readyCount = $state(0);
	let isReady = $state(false);
	let markingReady = $state(false);

	// UI state
	let submissions: Submission[] = $state([]);
	let mobileTab: 'challenge' | 'chat' | 'code' = $state('chat');

	// Sandbox state
	let sandboxLogs: string[] = $state([]);
	let sandboxUrl: string | null = $state(init.sandboxUrl || null);
	let sandboxReady = $state(init.sandboxReady || false);

	// Judging state (when timer hit 0 but AI analysis still running)
	let waitingForJudging = $state(false);
	let judgingCount = $state(0);
	let judgingPlayerIds = $state(new Set<string>());

	// Internal state
	let logsEventSource: EventSource | null = null;
	let textareaEl: HTMLTextAreaElement | null = null;
	let lastPreviewedMessageId = '';

	// Derived values
	const player = $derived(room.players.find((p) => p.id === init.playerId));
	// Show streaming code while generating, otherwise show selected code
	const activeCode = $derived(chat.streamingCode ?? codeSource?.code ?? '');

	// Calculate remaining time from server
	function calculateRemainingTime(): number {
		if (!room.challengeStartTime || !room.currentChallenge) return 0;
		const elapsed = Math.floor((init.serverTime - room.challengeStartTime) / 1000);
		const remaining = room.currentChallenge.timeLimit - elapsed;
		return Math.max(0, remaining);
	}

	function resetRound() {
		codeSource = null;
		submitted = false;
		result = null;
		submissions = [];
		showCelebration = false;
		earnedScore = 0;
		timeTaken = 0;
		sandboxUrl = null;
		sandboxReady = false;
		sandboxLogs = [];
		lastPreviewedMessageId = '';
		reviewPlayers = [];
		reviewCountdown = 0;
		readyCount = 0;
		isReady = false;
		markingReady = false;
		allSubmitted = false;
		allSubmittedCountdown = 0;
		waitingForJudging = false;
		judgingCount = 0;
		judgingPlayerIds = new Set();
		// Clear any running countdown intervals
		if (allSubmittedIntervalRef) {
			clearInterval(allSubmittedIntervalRef);
			allSubmittedIntervalRef = null;
		}
		if (reviewIntervalRef) {
			clearInterval(reviewIntervalRef);
			reviewIntervalRef = null;
		}
		chat.reset();
	}

	// SSE Event Handlers
	function handleChallengeStarted(data: SSEChallengeStarted) {
		room = data.room;
		challenge = data.challenge;
		resetRound();
		timer.start(data.challenge.timeLimit);
		setTimeout(() => textareaEl?.focus(), 100);
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
							submissionTime: data.timeTaken,
							score: data.score || p.score,
							roundScore: data.roundScore,
							sandboxUrl: data.sandboxUrl || p.sandboxUrl,
							screenshotUrl: data.screenshotUrl || p.screenshotUrl
						}
					: p
			)
		};

		// Check if all players have submitted
		const allHaveSubmitted = room.players.every((p) => p.submissionTime !== undefined);
		if (allHaveSubmitted && !allSubmitted) {
			setTimeout(() => {
				allSubmitted = true;
				allSubmittedCountdown = 5;
				// Clear any existing interval before creating new one
				if (allSubmittedIntervalRef) clearInterval(allSubmittedIntervalRef);
				allSubmittedIntervalRef = setInterval(() => {
					allSubmittedCountdown--;
					if (allSubmittedCountdown <= 0 && allSubmittedIntervalRef) {
						clearInterval(allSubmittedIntervalRef);
						allSubmittedIntervalRef = null;
					}
				}, 1000);
			}, 5000);
		}
	}

	function handlePlayerReady(data: SSEPlayerReady) {
		readyCount = data.readyCount;
		// If this event is for the current player, mark them as ready
		if (data.playerId === init.playerId) {
			isReady = true;
		}
	}

	function handleRoundEnded(data: SSERoundEnded) {
		room = data.room;
		reviewPlayers = data.room.players;
		timer.stop();
		showCelebration = false;

		const reviewMs = data.reviewDuration || 10000;
		reviewCountdown = Math.ceil(reviewMs / 1000);
		// Clear any existing interval before creating new one
		if (reviewIntervalRef) clearInterval(reviewIntervalRef);
		reviewIntervalRef = setInterval(() => {
			reviewCountdown--;
			if (reviewCountdown <= 0 && reviewIntervalRef) {
				clearInterval(reviewIntervalRef);
				reviewIntervalRef = null;
			}
		}, 1000);
	}

	function handleGameEnded(data: SSEGameEnded) {
		room = data.room;
		timer.stop();
		showCelebration = false;
	}

	function handlePlayerJoinedLeft(data: SSEPlayerJoinedLeft) {
		room = data.room;
	}

	function handleRoomSandboxReady(data: SSERoomSandboxReady) {
		sandboxReady = true;
		room = data.room;
	}

	function handleSandboxReady(data: SSESandboxReady) {
		if (data.playerId === init.playerId) {
			sandboxUrl = data.sandboxUrl;
		}
	}

	function handleSandboxLog(data: SSESandboxLog) {
		sandboxLogs = [...sandboxLogs, data.message];
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
		// If count hits 0 and we were waiting, the round will end via SSE
		if (data.judgingCount === 0) {
			waitingForJudging = false;
		}
	}

	function handlePlayerScoreUpdated(data: SSEPlayerScoreUpdated) {
		// Update the player's score in room state
		room = {
			...room,
			players: room.players.map((p) =>
				p.id === data.playerId ? { ...p, score: data.score } : p
			)
		};
	}

	function handleJudgingComplete(data: SSEJudgingComplete) {
		// Judging is done, clear waiting state - round will end after delay
		waitingForJudging = false;
		judgingCount = 0;
	}

	// Actions
	async function startGame() {
		await startRound(room.code);
	}

	async function submit() {
		if (submitting || submitted || !codeSource || !challenge) return;

		submitting = true;
		sandboxLogs = [];

		// Freeze timer at submission time
		timeTaken = challenge.timeLimit - timer.timeLeft;
		timer.stop();

		const logsParams = new URLSearchParams({ playerId: init.playerId });
		logsEventSource = new EventSource(`/api/sandbox-logs?${logsParams.toString()}`);

		logsEventSource.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === 'log') {
					sandboxLogs = [...sandboxLogs, msg.message];
					const urlMatch = msg.message.match(/Sandbox URL: (https:\/\/[^\s]+)/);
					if (urlMatch && !sandboxUrl) {
						sandboxUrl = urlMatch[1];
					}
				}
			} catch {
				// Ignore malformed JSON
			}
		};

		logsEventSource.onerror = () => {
			// Connection error - close and clean up
			logsEventSource?.close();
			logsEventSource = null;
		};

		try {
			// Send messageId instead of code - server retrieves code from chat store
			const response = await submitCode({
				roomCode: room.code,
				messageId: codeSource.messageId
			});
			result = response.result;

			if (response.result.sandboxUrl) {
				sandboxUrl = response.result.sandboxUrl;
			}

			submitted = true;
			earnedScore = response.roundScore;

			if (response.result.passed) {
				showCelebration = true;
				fireSuccessConfetti();
			}
		} catch (err) {
			console.error('Submit error:', err);
			sandboxLogs = [...sandboxLogs, `ERROR: ${err}`];
		} finally {
			submitting = false;
			logsEventSource?.close();
			logsEventSource = null;
		}
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
		if (lastCode && !submitted) codeSource = lastCode;
	}

	async function continueToNextRound() {
		if (isReady || markingReady) return; // Prevent double-clicks
		markingReady = true;
		try {
			await markReady(room.code);
			isReady = true; // Only set after successful API call
		} catch (err) {
			console.error('Failed to mark ready:', err);
		} finally {
			markingReady = false;
		}
	}

	function closeCelebration() {
		showCelebration = false;
	}

	function setMobileTab(tab: 'challenge' | 'chat' | 'code') {
		mobileTab = tab;
	}

	function setTextareaRef(el: HTMLTextAreaElement) {
		textareaEl = el;
	}

	function focusTextarea() {
		textareaEl?.focus();
	}

	// Keyboard handler
	function handleKeydown(e: KeyboardEvent) {
		const isMod = e.metaKey || e.ctrlKey;

		if (isMod && e.key === 'u') {
			e.preventDefault();
			selectLastCode();
		}

		if (isMod && e.key === 'Enter') {
			e.preventDefault();
			if (!submitting && !submitted && codeSource) submit();
		}

		if (e.key === 'Escape') {
			e.preventDefault();
			focusTextarea();
		}
	}

	// Preview effect - updates sandbox when code changes
	$effect(() => {
		if (
			codeSource &&
			codeSource.messageId !== lastPreviewedMessageId &&
			!chat.loading &&
			room.status === 'playing' &&
			!submitting
		) {
			lastPreviewedMessageId = codeSource.messageId;
			// Send messageId instead of code - server retrieves code from chat store
			updatePreview({ roomCode: room.code, messageId: codeSource.messageId })
				.then((res) => {
					if (res.sandboxUrl) {
						sandboxUrl = res.sandboxUrl;
					}
				})
				.catch(() => {});
		}
	});

	// Setup on mount
	function setup() {
		// Create SSE connection
		const eventSource = new EventSource(`/${init.room.code}/events`);

		eventSource.onmessage = (event) => {
			try {
				const { event: type, data } = JSON.parse(event.data);
				switch (type) {
					case 'challenge_started':
						handleChallengeStarted(data);
						break;
					case 'player_submitted':
						handlePlayerSubmitted(data);
						break;
					case 'player_ready':
						handlePlayerReady(data);
						break;
					case 'round_ended':
						handleRoundEnded(data);
						break;
					case 'game_ended':
						handleGameEnded(data);
						break;
					case 'player_joined':
					case 'player_left':
						handlePlayerJoinedLeft(data);
						break;
					case 'room_sandbox_ready':
						handleRoomSandboxReady(data);
						break;
					case 'sandbox_ready':
						handleSandboxReady(data);
						break;
					case 'sandbox_log':
						handleSandboxLog(data);
						break;
					case 'waiting_for_judging':
						handleWaitingForJudging(data);
						break;
					case 'judging_started':
						handleJudgingStarted(data);
						break;
					case 'judging_finished':
						handleJudgingFinished(data);
						break;
					case 'player_score_updated':
						handlePlayerScoreUpdated(data);
						break;
					case 'judging_complete':
						handleJudgingComplete(data);
						break;
				}
			} catch {
				// Ignore malformed JSON from SSE
			}
		};

		eventSource.onerror = () => {
			// Connection lost - SSE will auto-reconnect
			console.warn('SSE connection error, will auto-reconnect...');
		};

		window.addEventListener('keydown', handleKeydown);

		// Resume state if already playing
		if (room.status === 'playing') {
			const remaining = calculateRemainingTime();
			if (remaining > 0) {
				timer.start(remaining);
			}
			if (player?.submissionTime !== undefined) {
				submitted = true;
			}
			const lastCode = chat.findLastCode();
			if (lastCode) {
				codeSource = lastCode;
			}
			setTimeout(() => focusTextarea(), 100);
		}

		return () => {
			eventSource.close();
			window.removeEventListener('keydown', handleKeydown);
			// Clean up any running intervals
			if (allSubmittedIntervalRef) {
				clearInterval(allSubmittedIntervalRef);
				allSubmittedIntervalRef = null;
			}
			if (reviewIntervalRef) {
				clearInterval(reviewIntervalRef);
				reviewIntervalRef = null;
			}
		};
	}

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
			return submitting;
		},
		get submitted() {
			return submitted;
		},
		get result() {
			return result;
		},
		get earnedScore() {
			return earnedScore;
		},
		get timeTaken() {
			return timeTaken;
		},
		get showCelebration() {
			return showCelebration;
		},

		// All submitted
		get allSubmitted() {
			return allSubmitted;
		},
		get allSubmittedCountdown() {
			return allSubmittedCountdown;
		},

		// Review
		get reviewCountdown() {
			return reviewCountdown;
		},
		get reviewPlayers() {
			return reviewPlayers;
		},
		get readyCount() {
			return readyCount;
		},
		get isReady() {
			return isReady;
		},
		get markingReady() {
			return markingReady;
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
			return sandboxLogs;
		},
		get sandboxUrl() {
			return sandboxUrl;
		},
		get sandboxReady() {
			return sandboxReady;
		},

		// Judging state
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
		continueToNextRound,
		closeCelebration,
		setMobileTab,
		setTextareaRef
	};
}
