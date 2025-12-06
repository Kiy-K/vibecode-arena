import type { PageServerLoad } from './$types';

import { RoomService } from '$lib/server/rooms/RoomService';
import { getChatHistory } from '$lib/server/chat-store';
import { SandboxManager } from '$lib/server/e2b';
import { sanitizeRoom } from '$lib/server/sanitize';

import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const room = RoomService.getByCode(params.code);
	if (!room) {
		error(404, 'Room not found');
	}

	const playerId = cookies.get(`player_${room.id}`);
	const player = room.players.find((p) => p.id === playerId);

	if (!player) {
		error(403, 'You are not in this room');
	}

	// Get chat history for current round
	const roundId = `${room.id}:${room.round}`;
	const chatHistory = getChatHistory(playerId!, roundId);

	// Get sandbox status (room-based, not player-based)
	const sandboxReady = SandboxManager.isReady(room.id);
	const sandboxUrl = SandboxManager.getPlayerUrl(room.id, playerId!);

	return {
		room: sanitizeRoom(room),
		playerId: playerId!,
		isHost: room.hostId === playerId,
		serverTime: Date.now(),
		chatHistory,
		sandboxReady,
		sandboxUrl
	};
};
