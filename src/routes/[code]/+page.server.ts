import type { PageServerLoad } from './$types';

import { error } from '@sveltejs/kit';

import { room, getWebSocketUrl } from '$lib/server/do-client';
import { getChatHistory } from '$lib/server/chat-store';
import { SandboxManager } from '$lib/server/e2b';
import type { Room, Player, PublicRoom, PublicPlayer, Challenge } from '$lib/types/game';

/** Sanitize player data for client */
function sanitizePlayer(p: Player): PublicPlayer {
	return {
		id: p.id,
		name: p.name,
		model: p.model,
		score: p.score,
		promptsUsed: p.promptsUsed,
		hasSubmitted: p.submissionTime !== undefined,
		passed: p.passed,
		roundScore: p.roundScore,
		sandboxUrl: p.sandboxUrl,
		screenshotUrl: p.screenshotUrl
	};
}

/** Sanitize room data for client (remove internal fields) */
function sanitizeRoom(r: Room): PublicRoom {
	return {
		code: r.code,
		status: r.status,
		round: r.round,
		maxRounds: r.maxRounds,
		players: r.players.map(sanitizePlayer),
		currentChallenge: r.currentChallenge
			? sanitizeChallenge(r.currentChallenge as Challenge)
			: undefined
	};
}

/** Sanitize challenge (remove reference code) */
function sanitizeChallenge(c: Challenge) {
	const { referenceCode: _, css: __, ...safe } = c;
	return safe;
}

export const load: PageServerLoad = async ({ params, cookies }) => {
	// Get full room from DO (server-side needs room.id for cookies/chat)
	const r = await room.getFull(params.code);
	if (!r) {
		error(404, 'Room not found');
	}

	const playerId = cookies.get(`player_${r.id}`);
	if (!playerId) {
		error(403, 'You are not in this room');
	}

	const player = r.players.find((p) => p.id === playerId);
	if (!player) {
		error(403, 'You are not in this room');
	}

	// Get chat history
	const roundId = `${r.id}:${r.round}`;
	const chatHistory = getChatHistory(playerId, roundId);

	// Get sandbox status
	const sandboxReady = SandboxManager.isReady(r.id);
	const sandboxUrl = SandboxManager.getPlayerUrl(r.id, playerId);

	// Pass WebSocket URL for DO connection
	const wsUrl = getWebSocketUrl(params.code, playerId);

	return {
		room: sanitizeRoom(r),
		playerId,
		isHost: r.hostId === playerId,
		serverTime: Date.now(),
		chatHistory,
		sandboxReady,
		sandboxUrl,
		wsUrl
	};
};
