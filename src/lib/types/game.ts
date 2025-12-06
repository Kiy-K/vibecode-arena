/**
 * Game type definitions.
 * Core types for rooms, players, challenges, and SSE events.
 */

export type { ModelId, Model } from '$lib/config/models';
import type { ModelId } from '$lib/config/models';

/** Challenge categories for filtering/display */
export type ChallengeCategory = 'component' | 'interaction' | 'layout' | 'animation' | 'form';

/** Challenge definition with reference solution */
export interface Challenge {
	id: string;
	category: ChallengeCategory;
	title: string;
	description?: string;
	referenceCode: string;
	defaultProps: Record<string, unknown>;
	// Animation config: { propName: [min, max] } for automatic demo animations
	animateProps?: Record<string, [number, number]>;
	css?: string;
	timeLimit: number;
}

/** Challenge without sensitive data (for sending to clients) */
export type PublicChallenge = Omit<Challenge, 'referenceCode' | 'css'>;

/** Result of a player's code submission */
export interface SubmissionResult {
	passed: boolean;
	score: number;
	maxScore: number;
	feedback: string;
	screenshotUrl?: string;
	sandboxUrl?: string;
	error?: string;
}

/** Player in a game room */
export interface Player {
	id: string;
	name: string;
	model: ModelId;
	score: number;
	promptsUsed: number;
	/** Time taken to submit (ms from round start), -1 if no submission */
	submissionTime?: number;
	passed?: boolean;
	code?: string;
	sandboxUrl?: string;
	/** Screenshot data URL for when sandbox is unavailable */
	screenshotUrl?: string;
	/** Score earned this round (for review display) */
	roundScore?: number;
	/** Whether the player's sandbox is prewarmed */
	sandboxReady?: boolean;
}

/** Room lifecycle states */
export type RoomStatus = 'waiting' | 'playing' | 'reviewing' | 'finished';

/** Game room containing players and challenge state */
export interface Room {
	id: string;
	code: string;
	hostId: string;
	players: Player[];
	status: RoomStatus;
	currentChallenge?: Challenge | PublicChallenge;
	challengeStartTime?: number;
	round: number;
	maxRounds: number;
	usedChallengeIds: string[];
}

/** Game event for logging/debugging */
export interface GameEvent {
	type:
	| 'player_joined'
	| 'player_left'
	| 'game_started'
	| 'challenge_started'
	| 'player_submitted'
	| 'round_ended'
	| 'game_ended';
	data: unknown;
	timestamp: number;
}

// =============================================================================
// SSE Event Data Types
// =============================================================================

/** SSE: Challenge started event data */
export interface SSEChallengeStarted {
	room: Room;
	challenge: Challenge;
}

/** SSE: Player submitted their solution */
export interface SSEPlayerSubmitted {
	playerId: string;
	passed: boolean;
	score?: number;
	roundScore?: number;
	timeTaken?: number;
	sandboxUrl?: string;
	screenshotUrl?: string;
}

/** SSE: Player marked ready during review */
export interface SSEPlayerReady {
	playerId: string;
	readyCount: number;
	totalPlayers: number;
}

/** SSE: Round ended, entering review phase */
export interface SSERoundEnded {
	room: Room;
	reviewDuration?: number;
}

/** SSE: Game finished */
export interface SSEGameEnded {
	room: Room;
}

/** SSE: Player joined or left room */
export interface SSEPlayerJoinedLeft {
	room: Room;
}

/** SSE: Room sandbox is ready */
export interface SSERoomSandboxReady {
	room: Room;
}

/** SSE: Individual player sandbox ready */
export interface SSESandboxReady {
	playerId: string;
	sandboxUrl: string;
}

/** SSE: Sandbox log message */
export interface SSESandboxLog {
	message: string;
}

/** SSE: Round ended but waiting for judging */
export interface SSEWaitingForJudging {
	judgingCount: number;
}

/** SSE: Started judging a player's submission */
export interface SSEJudgingStarted {
	playerId: string;
	judgingCount: number;
}

/** SSE: Finished judging a player's submission */
export interface SSEJudgingFinished {
	playerId: string;
	judgingCount: number;
}

/** SSE: Player's score was updated (e.g., hint used) */
export interface SSEPlayerScoreUpdated {
	playerId: string;
	score: number;
	deducted: number;
}

/** SSE: All judging complete, transitioning to review */
export interface SSEJudgingComplete {
	delay: number;
}

/** Discriminated union of all SSE event types */
export type SSEEventData =
	| { type: 'challenge_started'; data: SSEChallengeStarted }
	| { type: 'player_submitted'; data: SSEPlayerSubmitted }
	| { type: 'player_ready'; data: SSEPlayerReady }
	| { type: 'round_ended'; data: SSERoundEnded }
	| { type: 'game_ended'; data: SSEGameEnded }
	| { type: 'player_joined'; data: SSEPlayerJoinedLeft }
	| { type: 'player_left'; data: SSEPlayerJoinedLeft }
	| { type: 'room_sandbox_ready'; data: SSERoomSandboxReady }
	| { type: 'sandbox_ready'; data: SSESandboxReady }
	| { type: 'sandbox_log'; data: SSESandboxLog }
	| { type: 'waiting_for_judging'; data: SSEWaitingForJudging }
	| { type: 'judging_started'; data: SSEJudgingStarted }
	| { type: 'judging_finished'; data: SSEJudgingFinished }
	| { type: 'player_score_updated'; data: SSEPlayerScoreUpdated }
	| { type: 'judging_complete'; data: SSEJudgingComplete };
