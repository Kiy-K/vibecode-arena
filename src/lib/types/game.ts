export type { ModelId, Model } from '$lib/config/models';
import type { ModelId } from '$lib/config/models';

export type ChallengeCategory = 'component' | 'interaction' | 'layout' | 'animation' | 'form';

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

// Challenge without sensitive data (for sending to clients)
export type PublicChallenge = Omit<Challenge, 'referenceCode' | 'css'>;

export interface SubmissionResult {
	passed: boolean;
	score: number;
	maxScore: number;
	feedback: string;
	screenshotUrl?: string;
	sandboxUrl?: string;
	error?: string;
}

export interface Player {
	id: string;
	name: string;
	model: ModelId;
	score: number;
	promptsUsed: number;
	submissionTime?: number;
	passed?: boolean;
	code?: string;
	sandboxUrl?: string;
	screenshotUrl?: string; // Data URL of screenshot for when sandbox is unavailable
	roundScore?: number; // Score earned this round (for review display)
	sandboxReady?: boolean; // Whether the player's sandbox is prewarmed
}

export type RoomStatus = 'waiting' | 'playing' | 'reviewing' | 'finished';

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

// SSE Event Data Types
export interface SSEChallengeStarted {
	room: Room;
	challenge: Challenge;
}

export interface SSEPlayerSubmitted {
	playerId: string;
	passed: boolean;
	score?: number;
	roundScore?: number;
	timeTaken?: number;
	sandboxUrl?: string;
	screenshotUrl?: string;
}

export interface SSEPlayerReady {
	playerId: string;
	readyCount: number;
	totalPlayers: number;
}

export interface SSERoundEnded {
	room: Room;
	reviewDuration?: number;
}

export interface SSEGameEnded {
	room: Room;
}

export interface SSEPlayerJoinedLeft {
	room: Room;
}

export interface SSERoomSandboxReady {
	room: Room;
}

export interface SSESandboxReady {
	playerId: string;
	sandboxUrl: string;
}

export interface SSESandboxLog {
	message: string;
}

export interface SSEWaitingForJudging {
	judgingCount: number;
}

export interface SSEJudgingStarted {
	playerId: string;
	judgingCount: number;
}

export interface SSEJudgingFinished {
	playerId: string;
	judgingCount: number;
}

export interface SSEPlayerScoreUpdated {
	playerId: string;
	score: number;
	deducted: number;
}

export interface SSEJudgingComplete {
	delay: number;
}

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
