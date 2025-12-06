import { nanoid } from 'nanoid';
import { randomBytes } from 'crypto';
import type { Room, Player, ModelId } from '$lib/types/game';

// Removed ambiguous characters: 0, O, I, 1, L
const JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Maximum attempts to generate a unique join code
const MAX_CODE_ATTEMPTS = 10;

class RoomServiceImpl {
	private rooms = new Map<string, Room>();
	private codeToRoom = new Map<string, string>();
	private activeConnections = new Map<string, Set<string>>(); // roomId -> Set of playerIds

	/**
	 * Generate a cryptographically secure 6-character join code.
	 * Uses crypto.randomBytes for better entropy than Math.random().
	 * Ensures the code doesn't already exist.
	 */
	private generateJoinCode(): string {
		for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
			const bytes = randomBytes(6);
			const code = Array.from(bytes, (byte) => JOIN_CODE_CHARS[byte % JOIN_CODE_CHARS.length]).join('');

			// Check if code is already in use
			if (!this.codeToRoom.has(code)) {
				return code;
			}
		}

		// Fallback: append timestamp suffix (very unlikely to reach here)
		const bytes = randomBytes(4);
		const base = Array.from(bytes, (byte) => JOIN_CODE_CHARS[byte % JOIN_CODE_CHARS.length]).join('');
		return base + Date.now().toString(36).slice(-2).toUpperCase();
	}

	private createPlayer(name: string, model: ModelId): Player {
		return { id: nanoid(), name, model, score: 0, promptsUsed: 0 };
	}

	get(roomId: string): Room | undefined {
		return this.rooms.get(roomId);
	}

	getById(roomId: string): Room | undefined {
		return this.rooms.get(roomId);
	}

	getByCode(code: string): Room | undefined {
		const roomId = this.codeToRoom.get(code.toUpperCase());
		return roomId ? this.rooms.get(roomId) : undefined;
	}

	setPlayerSandboxReady(roomId: string, playerId: string): void {
		const room = this.rooms.get(roomId);
		if (!room) return;

		const player = room.players.find((p) => p.id === playerId);
		if (player) {
			player.sandboxReady = true;
		}
	}

	areAllPlayersReady(roomId: string): boolean {
		const room = this.rooms.get(roomId);
		if (!room) return false;
		return room.players.every((p) => p.sandboxReady === true);
	}

	create(hostName: string, hostModel: ModelId): Room {
		const host = this.createPlayer(hostName, hostModel);
		const room: Room = {
			id: nanoid(),
			code: this.generateJoinCode(),
			hostId: host.id,
			players: [host],
			status: 'waiting',
			round: 0,
			maxRounds: 5,
			usedChallengeIds: []
		};

		this.rooms.set(room.id, room);
		this.codeToRoom.set(room.code, room.id);
		return room;
	}

	join(code: string, playerName: string, model: ModelId): { room: Room; playerId: string } | null {
		const room = this.getByCode(code);
		if (!room || room.status !== 'waiting') return null;

		const player = this.createPlayer(playerName, model);
		room.players.push(player);
		return { room, playerId: player.id };
	}

	removePlayer(roomId: string, playerId: string): Room | null {
		const room = this.rooms.get(roomId);
		if (!room) return null;

		room.players = room.players.filter((p) => p.id !== playerId);

		if (room.hostId === playerId) {
			if (room.players.length > 0) {
				room.hostId = room.players[0].id;
			} else {
				this.rooms.delete(roomId);
				this.codeToRoom.delete(room.code);
				return null;
			}
		}

		return room;
	}

	delete(room: Room): void {
		this.rooms.delete(room.id);
		this.codeToRoom.delete(room.code);
		this.activeConnections.delete(room.id);
	}

	// --------------------------------------------------------------------------
	// Connection Tracking (for cleanup when all users leave)
	// --------------------------------------------------------------------------

	/**
	 * Track a player connecting to a room (e.g., SSE connection).
	 */
	trackConnection(roomId: string, playerId: string): void {
		if (!this.activeConnections.has(roomId)) {
			this.activeConnections.set(roomId, new Set());
		}
		this.activeConnections.get(roomId)!.add(playerId);
	}

	/**
	 * Track a player disconnecting from a room.
	 * If no connections remain and game is finished, cleans up the room.
	 */
	untrackConnection(roomId: string, playerId: string): void {
		const connections = this.activeConnections.get(roomId);
		if (!connections) return;

		connections.delete(playerId);

		// If no active connections and game is finished, clean up room
		if (connections.size === 0) {
			const room = this.rooms.get(roomId);
			if (room && room.status === 'finished') {
				this.delete(room);
			}
		}
	}

	/**
	 * Get count of active connections for a room.
	 */
	getConnectionCount(roomId: string): number {
		return this.activeConnections.get(roomId)?.size ?? 0;
	}

	/**
	 * Get total number of active rooms (for monitoring).
	 */
	getRoomCount(): number {
		return this.rooms.size;
	}
}

export const RoomService = new RoomServiceImpl();
