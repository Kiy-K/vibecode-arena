/**
 * Chat API endpoint.
 * Handles AI-assisted chat during gameplay.
 */

import type { RequestHandler } from './$types';
import type { Challenge } from '$lib/types/game';

import { nanoid } from 'nanoid';
import { json } from '@sveltejs/kit';

import { validateChatRequest, sanitizeMessages, trackPrompt } from '$lib/server/ai/validation';
import { saveChatMessage } from '$lib/server/chat-store';
import { streamChatResponse } from '$lib/server/ai/chat-stream';

/**
 * POST /api/chat
 * Validates request, saves user message, and streams AI response.
 */
export const POST: RequestHandler = async ({ request }) => {
	const validation = await validateChatRequest(request);
	if (!validation.ok) {
		return validation.response;
	}

	const { data, roundId, room } = validation;
	const messages = sanitizeMessages(data.messages);

	const lastUserMessage = messages.findLast((m) => m.role === 'user')?.content.trim();
	if (!lastUserMessage) {
		return json({ error: 'Empty message' }, { status: 400 });
	}

	// Save user message
	saveChatMessage(data.playerId, roundId, {
		id: nanoid(),
		role: 'user',
		content: lastUserMessage
	});

	trackPrompt(data.playerId, roundId);

	// Get player context for hint tool
	const challenge = room.currentChallenge as Challenge | undefined;
	const player = room.players.find((p) => p.id === data.playerId);

	return streamChatResponse({
		playerId: data.playerId,
		roomId: room.id,
		roomCode: room.code,
		roundId,
		model: data.model,
		language: data.language,
		challenge,
		playerScore: player?.score ?? 0,
		messages
	});
};
