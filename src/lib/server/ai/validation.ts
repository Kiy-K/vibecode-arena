import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Room } from '$lib/types/game';
import { MODEL_IDS } from '$lib/config/models';
import { CHAT_LIMITS } from './config';
import { GameService } from '$lib/server/game';
import { checkRateLimit, getPlayerPromptCount, incrementPlayerPrompt } from '$lib/server/ratelimit';

export const chatRequestSchema = v.object({
	messages: v.array(v.object({ role: v.string(), content: v.string() })),
	model: v.optional(v.picklist(MODEL_IDS)),
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

function err(message: string, status: number): ValidationError {
	return { ok: false, response: json({ error: message }, { status }) };
}

export async function validateChatRequest(request: Request): Promise<ValidationResult> {
	// Parse & validate schema
	const parsed = v.safeParse(chatRequestSchema, await request.json().catch(() => ({})));
	if (!parsed.success) {
		return err('Invalid request', 400);
	}

	const { roomCode, playerId } = parsed.output;

	// Validate game state
	const access = GameService.validateChatAccess(roomCode, playerId);
	if (!access.valid) {
		return err(access.error, 403);
	}

	// Rate limiting
	const rateLimit = checkRateLimit(`chat:${playerId}`, CHAT_LIMITS.rateLimit);
	if (!rateLimit.allowed) {
		return { ok: false, response: json({ error: 'Too many requests', resetIn: rateLimit.resetIn }, { status: 429 }) };
	}

	// Prompt count per round
	const roundId = `${access.room.id}:${access.room.round}`;
	if (getPlayerPromptCount(playerId, roundId) >= CHAT_LIMITS.maxPromptsPerRound) {
		return err(`Max ${CHAT_LIMITS.maxPromptsPerRound} prompts/round`, 429);
	}

	return { ok: true, data: parsed.output, room: access.room, roundId };
}

export function sanitizeMessages(messages: ChatRequest['messages']) {
	return messages.slice(-CHAT_LIMITS.maxMessagesInContext).map((m) => ({
		role: m.role === 'user' ? 'user' : 'assistant',
		content: m.content.slice(0, CHAT_LIMITS.maxMessageLength)
	})) as { role: 'user' | 'assistant'; content: string }[];
}

export function trackPrompt(playerId: string, roundId: string) {
	incrementPlayerPrompt(playerId, roundId);
}
