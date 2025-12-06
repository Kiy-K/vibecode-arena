/**
 * In-memory chat storage for player conversations.
 * Stores chat history per player per round.
 */

import { extractCodeBlock } from '$lib/utils/code';
import { CHAT_GREETING } from '$lib/server/ai/prompts';

/** Chat message structure */
interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
}

/** Chat history storage: "playerId:roundId" -> messages */
const chatStore = new Map<string, ChatMessage[]>();

/** Create composite key for player+round */
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
				id: "greeting",
				role: 'assistant',
				content: CHAT_GREETING
			}
		];
	}

	return messages;
}

/**
 * Save a chat message to history.
 * @param playerId - Player ID
 * @param roundId - Round identifier
 * @param message - Message to save
 */
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

/**
 * Clear all chat history for a player in a round.
 * @param playerId - Player ID
 * @param roundId - Round identifier
 */
export function clearChatHistory(playerId: string, roundId: string): void {
	chatStore.delete(getKey(playerId, roundId));
}

/**
 * Count user messages (prompts) in chat history.
 * @param playerId - Player ID
 * @param roundId - Round identifier
 * @returns Number of user messages
 */
export function getPromptsUsed(playerId: string, roundId: string): number {
	const messages = getChatHistory(playerId, roundId);
	return messages.filter((m) => m.role === 'user').length;
}

/**
 * Get a specific message by ID.
 * @param playerId - Player ID
 * @param roundId - Round identifier
 * @param messageId - Message ID to find
 * @returns The message or null if not found
 */
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
