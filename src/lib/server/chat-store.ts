import { extractCodeBlock } from '$lib/utils/code';
import { CHAT_GREETING } from '$lib/server/ai/prompts';

// Simple in-memory chat storage per player per round
interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
}

// Map: "playerId:roundId" -> messages
const chatStore = new Map<string, ChatMessage[]>();

/** ID for the greeting message (consistent across all chats) */
const GREETING_MESSAGE_ID = 'greeting';

function getKey(playerId: string, roundId: string): string {
	return `${playerId}:${roundId}`;
}

/**
 * Get chat history for a player in a round.
 * Returns greeting message if chat is empty.
 */
export function getChatHistory(playerId: string, roundId: string): ChatMessage[] {
	const messages = chatStore.get(getKey(playerId, roundId));

	// Return greeting if no messages yet
	if (!messages || messages.length === 0) {
		return [
			{
				id: GREETING_MESSAGE_ID,
				role: 'assistant',
				content: CHAT_GREETING
			}
		];
	}

	return messages;
}

export function saveChatMessage(
	playerId: string,
	roundId: string,
	message: ChatMessage
): void {
	const key = getKey(playerId, roundId);
	const messages = chatStore.get(key) || [];
	messages.push(message);
	chatStore.set(key, messages);
}

export function clearChatHistory(playerId: string, roundId: string): void {
	chatStore.delete(getKey(playerId, roundId));
}

// Get prompts used count for a player in a round
export function getPromptsUsed(playerId: string, roundId: string): number {
	const messages = getChatHistory(playerId, roundId);
	return messages.filter((m) => m.role === 'user').length;
}

// Get a specific message by ID
export function getMessage(
	playerId: string,
	roundId: string,
	messageId: string
): ChatMessage | null {
	const messages = getChatHistory(playerId, roundId);
	return messages.find((m) => m.id === messageId) || null;
}

/**
 * Extract code block from message content by message ID.
 * Uses the shared extractCodeBlock utility for consistent parsing.
 */
export function getCodeFromMessage(
	playerId: string,
	roundId: string,
	messageId: string
): string | null {
	const message = getMessage(playerId, roundId, messageId);
	if (!message || message.role !== 'assistant') return null;

	return extractCodeBlock(message.content);
}
