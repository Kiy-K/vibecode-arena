/**
 * Chat request validation module.
 * Validates and rate-limits incoming chat API requests.
 */

import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Room } from '$lib/types/game';
import { ENABLED_MODEL_IDS } from '$lib/config/models';
import { CHAT_LIMITS } from './config';
import { room } from '$lib/server/do-client';
import { checkRateLimit, getPlayerPromptCount, incrementPlayerPrompt } from '$lib/server/ratelimit';

/** Schema for validating chat API requests */
export const chatRequestSchema = v.object({
	messages: v.array(v.object({ role: v.string(), content: v.string() })),
	model: v.optional(
		v.pipe(
			v.string(),
			v.check((val) => ENABLED_MODEL_IDS.includes(val), 'Model not available')
		)
	),
	language: v.optional(v.string(), 'javascript'),
	roomCode: v.string(),
	playerId: v.string()
});

export type ChatRequest = v.InferOutput<typeof chatRequestSchema>;

type ValidationSuccess = {
	ok: true;
	data: ChatRequest;
	room: Room;
	roundId: string;
};

type ValidationError = {
	ok: false;
	response: Response;
};

export type ValidationResult = ValidationSuccess | ValidationError;

/** Create a validation error response */
function err(message: string, status: number): ValidationError {
	return { ok: false, response: json({ error: message }, { status }) };
}

/**
 * Validate an incoming chat API request.
 * Checks schema, game state, rate limits, and prompt limits.
 * @param request - The incoming HTTP request
 * @returns Validation result with parsed data or error response
 */
export async function validateChatRequest(request: Request): Promise<ValidationResult> {
	// Parse & validate schema
	const parsed = v.safeParse(chatRequestSchema, await request.json().catch(() => ({})));
	if (!parsed.success) {
		return err('Invalid request', 400);
	}

	const { roomCode, playerId } = parsed.output;

	// Get room from DO
	const r = await room.getFull(roomCode);
	if (!r) {
		return err('Room not found', 403);
	}
	if (r.status !== 'playing') {
		return err('Game is not active', 403);
	}

	const player = r.players.find((p) => p.id === playerId);
	if (!player) {
		return err('Player not in room', 403);
	}
	if (player.passed) {
		return err('Already passed this challenge', 403);
	}

	// Rate limiting
	const rateLimit = checkRateLimit(`chat:${playerId}`, CHAT_LIMITS.rateLimit);
	if (!rateLimit.allowed) {
		return {
			ok: false,
			response: json({ error: 'Too many requests', resetIn: rateLimit.resetIn }, { status: 429 })
		};
	}

	// Prompt count per round
	const roundId = `${r.id}:${r.round}`;
	if (getPlayerPromptCount(playerId, roundId) >= CHAT_LIMITS.maxPromptsPerRound) {
		return err(`Max ${CHAT_LIMITS.maxPromptsPerRound} prompts/round`, 429);
	}

	return { ok: true, data: parsed.output, room: r, roundId };
}

/**
 * Sanitize chat messages for AI consumption.
 * Truncates to max context length and message length.
 * @param messages - Raw messages from request
 * @returns Sanitized messages safe for AI
 */
export function sanitizeMessages(messages: ChatRequest['messages']) {
	return messages.slice(-CHAT_LIMITS.maxMessagesInContext).map((m) => ({
		role: m.role === 'user' ? 'user' : 'assistant',
		content: m.content.slice(0, CHAT_LIMITS.maxMessageLength)
	})) as { role: 'user' | 'assistant'; content: string }[];
}

/**
 * Track that a player used a prompt this round.
 * @param playerId - Player ID
 * @param roundId - Round identifier
 */
export function trackPrompt(playerId: string, roundId: string) {
	incrementPlayerPrompt(playerId, roundId);
}
