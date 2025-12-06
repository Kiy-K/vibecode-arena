import { nanoid } from 'nanoid';

import type { ModelId } from '$lib/types/game';
import { extractCodeBlock, extractStreamingCodeBlock } from '$lib/utils/code';

export interface ToolCall {
	toolName: string;
	result: unknown;
}

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	toolCalls?: ToolCall[];
}

/** Extract tool calls from content and return clean content */
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

export interface CodeSource {
	messageId: string;
	code: string;
}

interface SendOptions {
	roomCode: string;
	playerId: string;
	model: ModelId | undefined;
	language: string;
}

export function useChat(initialMessages: ChatMessage[] = []) {
	// Store the initial greeting message for reset
	const greetingMessage = initialMessages.length > 0 && initialMessages[0].role === 'assistant'
		? initialMessages[0]
		: null;

	let messages: ChatMessage[] = $state(initialMessages);
	let input = $state('');
	let loading = $state(false);

	// Streaming code (updated during generation)
	let streamingCode: string | null = $state(null);

	// Count prompts from initial messages
	let promptsUsed = $state(initialMessages.filter((m) => m.role === 'user').length);

	function reset() {
		// Reset to greeting message if we had one
		messages = greetingMessage ? [greetingMessage] : [];
		input = '';
		loading = false;
		promptsUsed = 0;
		streamingCode = null;
	}

	function init(newMessages: ChatMessage[]) {
		messages = newMessages;
		promptsUsed = newMessages.filter((m) => m.role === 'user').length;
	}

	function addMessage(role: 'user' | 'assistant', content: string): string {
		const id = nanoid();
		messages = [...messages, { id, role, content }];
		return id;
	}

	function addMessageWithId(role: 'user' | 'assistant', content: string, id: string): string {
		messages = [...messages, { id, role, content }];
		return id;
	}

	function updateLastMessage(content: string, toolCalls?: ToolCall[]) {
		const last = messages[messages.length - 1];
		messages = [...messages.slice(0, -1), { ...last, content, toolCalls: toolCalls || last.toolCalls }];
	}

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
				}
			}

			// Parse tool calls from final content
			const { content: cleanContent, toolCalls } = parseToolCalls(content);
			updateLastMessage(cleanContent, toolCalls);

			promptsUsed++;
			streamingCode = null; // Clear streaming code when done

			const code = extractCodeBlock(cleanContent);
			return code ? { messageId: assistantId, code } : null;
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Something went wrong';
			addMessage('assistant', `⚠️ ${msg}`);
			return null;
		} finally {
			loading = false;
			streamingCode = null;
		}
	}

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
		get messages() { return messages; },
		get input() { return input; },
		set input(v: string) { input = v; },
		get loading() { return loading; },
		get promptsUsed() { return promptsUsed; },
		get streamingCode() { return streamingCode; },
		send,
		reset,
		init,
		findLastCode
	};
}
