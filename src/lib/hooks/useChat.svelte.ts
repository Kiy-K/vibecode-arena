/**
 * Chat state hook.
 * Manages AI chat messages, streaming responses, and code extraction.
 *
 * Handles:
 * - Sending messages to the AI
 * - Streaming responses with real-time code extraction
 * - Tracking prompt usage
 * - Parsing tool calls from responses
 *
 * @example
 * ```ts
 * const chat = useChat(initialMessages);
 * chat.input = 'Create a button component';
 * const codeSource = await chat.send({
 *   roomCode: 'ABC123',
 *   playerId: 'player-1',
 *   model: 'gpt-4',
 *   language: 'javascript'
 * });
 * // codeSource contains { messageId, code } if code was generated
 * // chat.messages updated with new messages
 * // chat.streamingCode shows code during generation
 * ```
 */

import { nanoid } from 'nanoid';

import type { ModelId } from '$lib/types/game';
import { extractCodeBlock, extractStreamingCodeBlock, isCodeBlockComplete } from '$lib/utils/code';

/**
 * Tool call result from AI response.
 */
export interface ToolCall {
	/** Name of the tool that was called */
	toolName: string;
	/** Result returned by the tool */
	result: unknown;
}

/**
 * Chat message structure.
 */
export interface ChatMessage {
	/** Unique message ID */
	id: string;
	/** Message sender role */
	role: 'user' | 'assistant';
	/** Message content (may contain markdown/code) */
	content: string;
	/** Optional tool calls made during response */
	toolCalls?: ToolCall[];
}

/**
 * Extract tool calls from content and return clean content.
 * Tool calls are embedded as HTML comments in the format:
 * `<!--TOOL_CALLS:[{"toolName":"...", "result":...}]-->`
 *
 * @param content - Raw message content
 * @returns Cleaned content and extracted tool calls
 */
function parseToolCalls(content: string): { content: string; toolCalls: ToolCall[] } {
	const match = content.match(/<!--TOOL_CALLS:(.*?)-->/);
	if (!match) {
		return { content, toolCalls: [] };
	}
	try {
		const toolCalls = JSON.parse(match[1]) as ToolCall[];
		const cleanContent = content.replace(/\n*<!--TOOL_CALLS:.*?-->/g, '').trim();
		return { content: cleanContent, toolCalls };
	} catch {
		return { content: content.replace(/\n*<!--TOOL_CALLS:.*?-->/g, ''), toolCalls: [] };
	}
}

/**
 * Source of code extracted from a chat message.
 */
export interface CodeSource {
	/** ID of the message containing the code */
	messageId: string;
	/** Extracted code content */
	code: string;
}

/**
 * Options for sending a chat message.
 */
interface SendOptions {
	/** Room code for saving chat history */
	roomCode: string;
	/** Player ID for chat history association */
	playerId: string;
	/** AI model to use */
	model: ModelId | undefined;
	/** Programming language context */
	language: string;
}

/** Default greeting message shown at the start of each chat session */
const GREETING_MESSAGE: ChatMessage = {
	id: 'greeting',
	role: 'assistant',
	content: `Hey! I'm your coding assistant. Tell me what you want to build and I'll write the code.

Need help? Ask for a hint (-50 pts, max 3). Let's go!`
};

/**
 * Creates chat state management for AI conversations.
 *
 * @param initialMessages - Optional initial messages (e.g., from server)
 * @returns Chat state and controls
 */
export function useChat(initialMessages: ChatMessage[] = []) {
	// Use server messages if provided, otherwise start with greeting
	const startMessages = initialMessages.length > 0 ? initialMessages : [GREETING_MESSAGE];

	/** All chat messages */
	let messages: ChatMessage[] = $state(startMessages);
	/** Current input field value */
	let input = $state('');
	/** Whether a message is being sent/streamed */
	let loading = $state(false);

	/** Code being extracted during streaming (for real-time preview) */
	let streamingCode: string | null = $state(null);

	/** Complete code source detected during streaming (for early sandbox preview) */
	let streamingCodeSource: CodeSource | null = $state(null);

	/** Number of prompts used this round */
	let promptsUsed = $state(initialMessages.filter((m) => m.role === 'user').length);

	/**
	 * Reset chat to initial state (greeting message only).
	 */
	function reset() {
		messages = [GREETING_MESSAGE];
		input = '';
		loading = false;
		promptsUsed = 0;
		streamingCode = null;
		streamingCodeSource = null;
	}

	/**
	 * Initialize chat with new messages (e.g., from server on reconnect).
	 * @param newMessages - Messages to initialize with
	 */
	function init(newMessages: ChatMessage[]) {
		messages = newMessages;
		promptsUsed = newMessages.filter((m) => m.role === 'user').length;
	}

	/**
	 * Add a message with auto-generated ID.
	 * @param role - Message sender role
	 * @param content - Message content
	 * @returns Generated message ID
	 */
	function addMessage(role: 'user' | 'assistant', content: string): string {
		const id = nanoid();
		messages = [...messages, { id, role, content }];
		return id;
	}

	/**
	 * Add a message with a specific ID (for server-synced messages).
	 * @param role - Message sender role
	 * @param content - Message content
	 * @param id - Specific ID to use
	 * @returns The provided message ID
	 */
	function addMessageWithId(role: 'user' | 'assistant', content: string, id: string): string {
		messages = [...messages, { id, role, content }];
		return id;
	}

	/**
	 * Update the last message's content (for streaming).
	 * @param content - New content
	 * @param toolCalls - Optional tool calls to attach
	 */
	function updateLastMessage(content: string, toolCalls?: ToolCall[]) {
		const last = messages[messages.length - 1];
		messages = [
			...messages.slice(0, -1),
			{ ...last, content, toolCalls: toolCalls || last.toolCalls }
		];
	}

	/**
	 * Send a chat message and stream the response.
	 * Extracts code blocks from the response for submission.
	 *
	 * @param opts - Send options (room, player, model, language)
	 * @returns Code source if code was generated, null otherwise
	 */
	async function send(opts: SendOptions): Promise<CodeSource | null> {
		if (!input.trim() || loading) return null;

		const userMessage = input.trim();
		input = '';
		addMessage('user', userMessage);
		loading = true;

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: messages.map((m) => ({ role: m.role, content: m.content })),
					model: opts.model,
					language: opts.language,
					roomCode: opts.roomCode,
					playerId: opts.playerId
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.error || 'Chat failed');
			}

			// Get the server-generated message ID from header
			const serverMessageId = res.headers.get('X-Message-Id');
			if (!serverMessageId) {
				throw new Error('Missing message ID from server');
			}
			const assistantId = addMessageWithId('assistant', '', serverMessageId);
			let content = '';

			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			let codeBlockCompleteTriggered = false;

			while (reader) {
				const { done, value } = await reader.read();
				if (done) break;
				content += decoder.decode(value);
				// Show raw content during streaming (tool markers may not be complete yet)
				updateLastMessage(content);

				// Update streaming code as it arrives (for real-time code panel display)
				const partialCode = extractStreamingCodeBlock(content);
				if (partialCode) {
					streamingCode = partialCode;

					// Trigger early preview when code block is complete (has closing ```)
					if (!codeBlockCompleteTriggered && isCodeBlockComplete(content)) {
						codeBlockCompleteTriggered = true;
						streamingCodeSource = { messageId: assistantId, code: partialCode };
					}
				}
			}

			// Parse tool calls from final content
			const { content: cleanContent, toolCalls } = parseToolCalls(content);
			updateLastMessage(cleanContent, toolCalls);

			promptsUsed++;
			streamingCode = null;
			streamingCodeSource = null;

			const code = extractCodeBlock(cleanContent);
			return code ? { messageId: assistantId, code } : null;
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Something went wrong';
			addMessage('assistant', `⚠️ ${msg}`);
			return null;
		} finally {
			loading = false;
			streamingCode = null;
			streamingCodeSource = null;
		}
	}

	/**
	 * Find the last code block in the chat history.
	 * Searches from newest to oldest messages.
	 *
	 * @returns Code source if found, null otherwise
	 */
	function findLastCode(): CodeSource | null {
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === 'assistant') {
				const code = extractCodeBlock(msg.content);
				if (code) return { messageId: msg.id, code };
			}
		}
		return null;
	}

	return {
		/** All chat messages */
		get messages() {
			return messages;
		},
		/** Current input field value */
		get input() {
			return input;
		},
		set input(v: string) {
			input = v;
		},
		/** Whether a message is being sent/streamed */
		get loading() {
			return loading;
		},
		/** Number of prompts used this round */
		get promptsUsed() {
			return promptsUsed;
		},
		/** Code being extracted during streaming (for preview) */
		get streamingCode() {
			return streamingCode;
		},
		/** Complete code source detected during streaming (for early sandbox preview) */
		get streamingCodeSource() {
			return streamingCodeSource;
		},
		send,
		reset,
		init,
		findLastCode
	};
}
