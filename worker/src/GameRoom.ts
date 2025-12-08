/**
 * GameRoom Durable Object
 *
 * Each game room is a single DO instance identified by room code.
 * Handles: state persistence, WebSocket connections, round timers.
 */

import { DurableObject } from 'cloudflare:workers';
import { nanoid } from '@sitnik/nanoid';
import type { Room, Player, Challenge, PublicChallenge, ModelId } from '$lib/types/game';
import { MODELS } from '$lib/config/models';
import { TIMERS, SCORING } from '$lib/config/game';

type AlarmType = 'round_end' | 'review_end' | 'post_judging';

// ============================================================================
// Types
// ============================================================================

export interface Env {
	GAME_ROOMS: DurableObjectNamespace<GameRoom>;
}

interface RPCRequest {
	method: string;
	params?: Record<string, unknown>;
}

/** Sanitized player data for clients */
interface PublicPlayer {
	id: string;
	name: string;
	model: ModelId;
	score: number;
	promptsUsed: number;
	hasSubmitted: boolean;
	passed?: boolean;
	roundScore?: number;
	sandboxUrl?: string;
	screenshotUrl?: string;
}

/** Sanitized room data for clients (no internal room.id, usedChallengeIds, etc.) */
interface PublicRoom {
	code: string;
	hostId: string;
	status: Room['status'];
	round: number;
	maxRounds: number;
	players: PublicPlayer[];
	currentChallenge?: PublicChallenge;
	timeRemaining?: number;
}

// ============================================================================
// GameRoom Durable Object
// ============================================================================

export class GameRoom extends DurableObject<Env> {
	private room: Room | null = null;
	private challenges: Challenge[] = [];

	// Transient state (not persisted, reset on DO wake)
	private readyPlayers = new Set<string>();
	private judgingPlayers = new Set<string>();
	private waitingForJudging = false;
	private hintUsage = new Map<string, number>();
	private waitTimes = new Map<string, number>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(() => this.loadState());
	}

	// ==========================================================================
	// State Management
	// ==========================================================================

	private async loadState(): Promise<void> {
		this.room = (await this.ctx.storage.get<Room>('room')) ?? null;
		this.challenges = (await this.ctx.storage.get<Challenge[]>('challenges')) ?? [];
		const hints = await this.ctx.storage.get<Record<string, number>>('hints');
		if (hints) this.hintUsage = new Map(Object.entries(hints));
	}

	private async saveRoom(): Promise<void> {
		if (this.room) await this.ctx.storage.put('room', this.room);
	}

	private async saveHints(): Promise<void> {
		await this.ctx.storage.put('hints', Object.fromEntries(this.hintUsage));
	}

	private async saveChallenges(): Promise<void> {
		await this.ctx.storage.put('challenges', this.challenges);
	}

	private async setAlarm(type: AlarmType, delayMs: number): Promise<void> {
		await this.ctx.storage.put('alarmType', type);
		await this.ctx.storage.setAlarm(Date.now() + delayMs);
	}

	private async clearAlarm(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
	}

	// ==========================================================================
	// HTTP & WebSocket Entry Points
	// ==========================================================================

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// WebSocket upgrade
		if (request.headers.get('Upgrade') === 'websocket') {
			return this.handleWebSocketUpgrade(url);
		}

		// RPC calls
		if (request.method === 'POST') {
			return this.handleRPC((await request.json()) as RPCRequest);
		}

		// Get room state
		if (request.method === 'GET') {
			return Response.json({ room: this.room ? this.sanitizeRoom(this.room) : null });
		}

		return new Response('Method not allowed', { status: 405 });
	}

	private handleWebSocketUpgrade(url: URL): Response {
		const playerId = url.searchParams.get('playerId');
		if (!playerId) return new Response('Missing playerId', { status: 400 });

		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server, [playerId]);

		if (this.room) {
			const isHost = this.room.hostId === playerId;
			const player = this.room.players.find((p) => p.id === playerId);
			server.send(
				this.message('connected', {
					room: this.sanitizeRoom(this.room),
					isHost,
					yourName: player?.name
				})
			);
		}

		return new Response(null, { status: 101, webSocket: client });
	}

	private async handleRPC({ method, params = {} }: RPCRequest): Promise<Response> {
		try {
			const result = await this.dispatchRPC(method, params);
			// Return result as-is (can be null for queries like getRoomFull)
			// Only use { ok: true } for void methods that return undefined
			return Response.json(result === undefined ? { ok: true } : result);
		} catch (err) {
			return Response.json({ error: String(err) }, { status: 400 });
		}
	}

	private async dispatchRPC(method: string, p: Record<string, unknown>): Promise<unknown> {
		switch (method) {
			// Room management
			case 'createRoom':
				return this.createRoom(
					p.code as string,
					p.hostName as string,
					p.hostModel as ModelId,
					p.challenges as Challenge[]
				);
			case 'joinRoom':
				return this.joinRoom(p.playerName as string, p.model as ModelId);
			case 'removePlayer':
				return this.removePlayer(p.playerId as string);

			// Game flow
			case 'startGame':
				return this.startGame();
			case 'setChallenge':
				return this.setChallenge(p.challenge as Challenge);
			case 'submitSolution':
				return this.submitSolution(p as unknown as SubmitParams);
			case 'markPlayerReady':
				return this.markPlayerReady(p.playerId as string);

			// Scoring & hints
			case 'deductScore':
				return this.deductScore(p.playerId as string, p.points as number);
			case 'useHint':
				return this.useHint(p.playerId as string);
			case 'getHintsRemaining':
				return this.getHintsRemaining(p.playerId as string);

			// Judging
			case 'startJudging':
				return this.startJudging(p.playerId as string);
			case 'finishJudging':
				return this.finishJudging(p.playerId as string);

			// Sandbox events
			case 'setPlayerSandboxReady':
				return this.setPlayerSandboxReady(p.playerId as string);
			case 'setRoomSandboxReady':
				return this.setRoomSandboxReady();
			case 'emitSandboxReady':
				return this.sendToPlayer(p.playerId as string, 'sandbox_ready', {
					sandboxUrl: p.sandboxUrl
				});
			case 'emitSandboxLog':
				return this.broadcast('sandbox_log', { message: p.message });
			case 'trackWaitTime':
				return this.trackWaitTime(p.playerId as string, p.ms as number);

			// Queries
			case 'getRoom':
				return this.room ? this.sanitizeRoom(this.room) : null;
			case 'getRoomFull':
				return this.room;

			default:
				throw new Error(`Unknown method: ${method}`);
		}
	}

	// ==========================================================================
	// WebSocket Events
	// ==========================================================================

	async webSocketMessage(_ws: WebSocket, _msg: string | ArrayBuffer): Promise<void> {
		// All actions go through HTTP RPC, WebSocket is for server→client only
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const [playerId] = this.ctx.getTags(ws);
		console.warn(`Player ${playerId} disconnected`);
	}

	async webSocketError(_ws: WebSocket, err: unknown): Promise<void> {
		console.error('WebSocket error:', err);
	}

	// ==========================================================================
	// Alarm Handler
	// ==========================================================================

	async alarm(): Promise<void> {
		const type = await this.ctx.storage.get<AlarmType>('alarmType');
		await this.ctx.storage.delete('alarmType');

		if (type === 'round_end' || type === 'post_judging') await this.endRound();
		if (type === 'review_end') await this.handleReviewEnd();
	}

	// ==========================================================================
	// Room Management
	// ==========================================================================

	private async createRoom(
		code: string,
		hostName: string,
		hostModel: ModelId,
		challenges: Challenge[]
	) {
		const host: Player = {
			id: nanoid(),
			name: hostName,
			model: hostModel,
			score: 0,
			promptsUsed: 0
		};

		this.room = {
			id: nanoid(),
			code,
			hostId: host.id,
			players: [host],
			status: 'waiting',
			round: 0,
			maxRounds: challenges.length,
			usedChallengeIds: []
		};

		// Store pre-picked challenges for the game
		this.challenges = challenges;

		await this.saveRoom();
		await this.saveChallenges();
		return { room: this.room, playerId: host.id };
	}

	private async joinRoom(playerName: string, model: ModelId) {
		if (!this.room || this.room.status !== 'waiting') return null;

		// Check for duplicate names
		const nameLower = playerName.toLowerCase();
		if (this.room.players.some((p) => p.name.toLowerCase() === nameLower)) {
			return { error: 'A player with that name already exists' };
		}

		const player: Player = {
			id: nanoid(),
			name: playerName,
			model,
			score: 0,
			promptsUsed: 0
		};

		this.room.players.push(player);
		await this.saveRoom();

		// Broadcast to all players
		this.broadcast('player_joined', {
			room: this.sanitizeRoom(this.room)
		});

		return { room: this.room, playerId: player.id };
	}

	private async removePlayer(playerId: string) {
		if (!this.room) return null;

		this.room.players = this.room.players.filter((p) => p.id !== playerId);

		// Handle host leaving
		if (this.room.hostId === playerId) {
			if (this.room.players.length > 0) {
				this.room.hostId = this.room.players[0].id;
			} else {
				await this.ctx.storage.deleteAll();
				this.room = null;
				return null;
			}
		}

		await this.saveRoom();

		// Broadcast to remaining players
		this.broadcast('player_left', {
			room: this.sanitizeRoom(this.room)
		});

		return this.room;
	}

	// ==========================================================================
	// Game Flow
	// ==========================================================================

	private async startGame() {
		if (!this.room || this.room.status !== 'waiting') return null;

		this.room.status = 'playing';
		this.room.round = 0;
		await this.saveRoom();
		this.broadcast('game_started', { room: this.sanitizeRoom(this.room) });

		// Automatically start the first round
		await this.startNextRound();

		return this.room;
	}

	/** Get the next challenge in sequence */
	private getNextChallenge(): Challenge | null {
		if (!this.room || this.challenges.length === 0) return null;
		// Challenges are pre-ordered, use round as index
		return this.challenges[this.room.round] || null;
	}

	/** Start the next round automatically */
	private async startNextRound(): Promise<boolean> {
		const challenge = this.getNextChallenge();
		if (!challenge) return false;

		await this.setChallenge(challenge);
		return true;
	}

	private async setChallenge(challenge: Challenge) {
		if (!this.room) return null;

		await this.clearAlarm();

		// Update room state
		Object.assign(this.room, {
			status: 'playing',
			currentChallenge: challenge,
			challengeStartTime: Date.now(),
			round: this.room.round + 1
		});

		if (!this.room.usedChallengeIds.includes(challenge.id)) {
			this.room.usedChallengeIds.push(challenge.id);
		}

		// Reset player state for new round
		for (const player of this.room.players) {
			Object.assign(player, {
				submissionTime: undefined,
				passed: undefined,
				code: undefined,
				sandboxUrl: undefined,
				roundScore: undefined
			});
		}

		// Reset transient state
		this.readyPlayers.clear();
		this.judgingPlayers.clear();
		this.waitingForJudging = false;
		this.hintUsage.clear();
		this.waitTimes.clear();

		await this.saveRoom();
		await this.saveHints();
		await this.setAlarm('round_end', challenge.timeLimit * 1000);

		// Broadcast challenge to all
		this.broadcast('challenge_started', {
			room: this.sanitizeRoom(this.room),
			challenge: this.sanitizeChallenge(challenge)
		});

		return this.room;
	}

	private async endRound() {
		if (!this.room || this.room.status !== 'playing') return null;

		// Wait for judging if in progress
		if (this.judgingPlayers.size > 0) {
			this.waitingForJudging = true;
			this.broadcast('waiting_for_judging', { judgingCount: this.judgingPlayers.size });
			return null;
		}

		// Mark non-submitters
		for (const player of this.room.players) {
			if (player.submissionTime === undefined) {
				Object.assign(player, { submissionTime: -1, passed: false, roundScore: 0 });
			}
		}

		this.room.status = 'reviewing';
		this.readyPlayers.clear();
		await this.saveRoom();

		const isLastRound = this.room.round >= this.room.maxRounds;
		this.broadcast('round_ended', {
			room: this.sanitizeRoom(this.room),
			leaderboard: this.getLeaderboard(),
			reviewDuration: TIMERS.REVIEW_DURATION,
			isLastRound
		});

		await this.setAlarm('review_end', TIMERS.REVIEW_DURATION);
		return this.room;
	}

	private async handleReviewEnd() {
		if (!this.room || this.room.status !== 'reviewing') return;

		if (this.room.round >= this.room.maxRounds) {
			await this.finishGame();
		} else {
			// Auto-start next round
			await this.startNextRound();
		}
	}

	private async finishGame() {
		if (!this.room) return;

		this.room.status = 'finished';
		await this.saveRoom();

		this.broadcast('game_ended', {
			room: this.sanitizeRoom(this.room),
			leaderboard: this.getLeaderboard()
		});
	}

	private async markPlayerReady(playerId: string) {
		if (!this.room || this.room.status !== 'reviewing') return false;

		this.readyPlayers.add(playerId);
		this.broadcast('player_ready', {
			playerId,
			readyCount: this.readyPlayers.size,
			totalPlayers: this.room.players.length
		});

		if (this.readyPlayers.size >= this.room.players.length) {
			await this.clearAlarm();
			await this.handleReviewEnd();
			return true;
		}

		return false;
	}

	// ==========================================================================
	// Submissions & Scoring
	// ==========================================================================

	private async submitSolution(params: SubmitParams) {
		if (!this.room?.challengeStartTime || this.room.status !== 'playing') return null;

		const player = this.room.players.find((p) => p.id === params.playerId);
		if (!player || player.submissionTime !== undefined) return null;

		const timeTaken = Date.now() - this.room.challengeStartTime;
		const waitTime = this.waitTimes.get(params.playerId) || 0;

		// Update player
		Object.assign(player, {
			submissionTime: timeTaken,
			passed: params.passed,
			promptsUsed: player.promptsUsed + params.promptsUsed,
			code: params.code,
			sandboxUrl: params.sandboxUrl,
			screenshotUrl: params.screenshotUrl
		});

		const roundScore = this.calculateScore(
			player,
			timeTaken,
			params.promptsUsed,
			waitTime,
			params.similarityScore,
			params.passed
		);
		player.score += roundScore;
		player.roundScore = roundScore;

		await this.saveRoom();

		this.broadcast('player_submitted', {
			playerId: params.playerId,
			passed: params.passed,
			score: player.score,
			roundScore,
			timeTaken,
			sandboxUrl: params.sandboxUrl,
			screenshotUrl: params.screenshotUrl
		});

		// End early if all submitted
		if (this.room.players.every((p) => p.submissionTime !== undefined)) {
			await this.clearAlarm();
			await this.setAlarm('round_end', TIMERS.END_ROUND_DELAY);
		}

		return { room: this.room, roundScore };
	}

	private calculateScore(
		player: Player,
		timeTaken: number,
		promptsUsed: number,
		waitTime: number,
		similarity: number,
		passed: boolean
	): number {
		const multiplier = MODELS.find((m) => m.id === player.model)?.multiplier ?? 1.0;
		const baseScore = Math.round(SCORING.BASE * (similarity / 100));

		if (!passed || !this.room) return Math.round(baseScore * multiplier);

		const timeLimit = (this.room.currentChallenge?.timeLimit ?? 300) * 1000;
		const effectiveTime = Math.max(0, timeTaken - waitTime);
		const position = this.room.players.filter((p) => p.passed).length;

		const timeBonus = Math.max(0, SCORING.TIME_BONUS_MAX * (1 - effectiveTime / timeLimit));
		const efficiencyBonus = Math.max(
			0,
			SCORING.EFFICIENCY_BONUS_MAX - promptsUsed * SCORING.EFFICIENCY_PENALTY_PER_PROMPT
		);
		const positionBonus = SCORING.POSITION_BONUSES[position] ?? 0;

		return Math.round((baseScore + timeBonus + efficiencyBonus + positionBonus) * multiplier);
	}

	private async deductScore(playerId: string, points: number) {
		const player = this.room?.players.find((p) => p.id === playerId);
		if (!player) return false;

		player.score = Math.max(0, player.score - points);
		await this.saveRoom();
		this.broadcast('player_score_updated', {
			playerId,
			score: player.score,
			deducted: points
		});

		return true;
	}

	// ==========================================================================
	// Hints
	// ==========================================================================

	private async useHint(playerId: string) {
		const used = this.hintUsage.get(playerId) || 0;
		const remaining = SCORING.MAX_HINTS - used;

		if (remaining <= 0) return { success: false, hintsRemaining: 0 };

		this.hintUsage.set(playerId, used + 1);
		await this.saveHints();

		return { success: true, hintsRemaining: remaining - 1 };
	}

	private getHintsRemaining(playerId: string): number {
		return SCORING.MAX_HINTS - (this.hintUsage.get(playerId) || 0);
	}

	// ==========================================================================
	// Judging
	// ==========================================================================

	private startJudging(playerId: string) {
		this.judgingPlayers.add(playerId);
		this.broadcast('judging_started', {
			playerId,
			judgingCount: this.judgingPlayers.size
		});
	}

	private async finishJudging(playerId: string) {
		this.judgingPlayers.delete(playerId);
		this.broadcast('judging_finished', {
			playerId,
			judgingCount: this.judgingPlayers.size
		});

		if (this.waitingForJudging && this.judgingPlayers.size === 0) {
			this.waitingForJudging = false;
			this.broadcast('judging_complete', { delay: TIMERS.POST_JUDGING_DELAY });
			await this.setAlarm('post_judging', TIMERS.POST_JUDGING_DELAY);
		}
	}

	// ==========================================================================
	// Sandbox
	// ==========================================================================

	private async setPlayerSandboxReady(playerId: string) {
		const player = this.room?.players.find((p) => p.id === playerId);
		if (!player) return;

		player.sandboxReady = true;
		await this.saveRoom();

		if (this.room?.players.every((p) => p.sandboxReady)) {
			this.broadcast('room_sandbox_ready', { room: this.sanitizeRoom(this.room) });
		}
	}

	/**
	 * Mark the entire room's sandbox as ready.
	 * Sets sandboxReady=true for ALL current players and broadcasts the event.
	 * This is called when the E2B sandbox server is ready.
	 */
	private async setRoomSandboxReady() {
		if (!this.room) return;

		// Mark ALL players as sandbox ready
		for (const player of this.room.players) {
			player.sandboxReady = true;
		}
		await this.saveRoom();

		// Broadcast to all connected clients
		this.broadcast('room_sandbox_ready', { room: this.sanitizeRoom(this.room) });
	}

	private trackWaitTime(playerId: string, ms: number) {
		this.waitTimes.set(playerId, (this.waitTimes.get(playerId) || 0) + ms);
	}

	// ==========================================================================
	// Helpers
	// ==========================================================================

	/** Get leaderboard as sanitized players sorted by score */
	private getLeaderboard(): PublicPlayer[] {
		return [...(this.room?.players || [])]
			.sort((a, b) => b.score - a.score)
			.map((p) => this.sanitizePlayer(p));
	}

	/** Calculate remaining time for current challenge */
	private getTimeRemaining(): number | undefined {
		if (!this.room?.challengeStartTime || !this.room.currentChallenge) return undefined;
		const elapsed = Math.floor((Date.now() - this.room.challengeStartTime) / 1000);
		return Math.max(0, this.room.currentChallenge.timeLimit - elapsed);
	}

	/** Sanitize a player for client consumption */
	private sanitizePlayer(player: Player): PublicPlayer {
		return {
			id: player.id,
			name: player.name,
			model: player.model,
			score: player.score,
			promptsUsed: player.promptsUsed,
			hasSubmitted: player.submissionTime !== undefined,
			passed: player.passed,
			roundScore: player.roundScore,
			sandboxUrl: player.sandboxUrl,
			screenshotUrl: player.screenshotUrl
		};
	}

	/** Sanitize room for client consumption (remove internal IDs) */
	private sanitizeRoom(room: Room): PublicRoom {
		return {
			code: room.code,
			hostId: room.hostId,
			status: room.status,
			round: room.round,
			maxRounds: room.maxRounds,
			players: room.players.map((p) => this.sanitizePlayer(p)),
			currentChallenge: room.currentChallenge
				? this.sanitizeChallenge(room.currentChallenge as Challenge)
				: undefined,
			timeRemaining: this.getTimeRemaining()
		};
	}

	/** Sanitize challenge (remove reference code) */
	private sanitizeChallenge(c: Challenge | PublicChallenge): PublicChallenge {
		const { referenceCode: _, css: __, ...safe } = c as Challenge;
		return safe;
	}

	/** Create a JSON message */
	private message(type: string, data: unknown): string {
		return JSON.stringify({ type, data, timestamp: Date.now() });
	}

	/** Broadcast to all connected WebSockets */
	private broadcast(type: string, data: unknown): void {
		const msg = this.message(type, data);
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(msg);
			} catch {
				/* closed */
			}
		}
	}

	/** Send message to a specific player only */
	private sendToPlayer(playerId: string, type: string, data: unknown): void {
		const msg = this.message(type, data);
		for (const ws of this.ctx.getWebSockets(playerId)) {
			try {
				ws.send(msg);
			} catch {
				/* closed */
			}
		}
	}
}

// ==========================================================================
// Types
// ==========================================================================

interface SubmitParams {
	playerId: string;
	passed: boolean;
	promptsUsed: number;
	code: string;
	similarityScore: number;
	sandboxUrl?: string;
	screenshotUrl?: string;
}
