import type { Challenge } from '$lib/types/game';

import { streamText, stepCountIs } from 'ai';
import { nanoid } from 'nanoid';

import { openrouter, CHAT_LIMITS, DEFAULT_MODEL } from './config';

import { getCodingAssistantPrompt } from './prompts';
import { getToolsForAI } from './tools';
import { scoring } from '../do-client';
import { SandboxManager } from '../e2b';
import { saveChatMessage } from '../chat-store';
import { addPlayerWaitTime } from '../ratelimit';
import { extractCodeBlock } from '$lib/utils/code';
import { createLogger } from '../logger';

const log = createLogger('ChatStream');

interface ChatContext {
	playerId: string;
	roomId: string;
	roomCode: string;
	roundId: string;
	model: string | undefined;
	language: string;
	challenge: Challenge | undefined;
	playerScore: number;
	messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

interface ToolCallResult {
	toolName: string;
	result: unknown;
}

/**
 * Handle hint tool result - deduct score if successful
 */
function processHintResult(result: unknown, roomCode: string, playerId: string): void {
	if (!result || typeof result !== 'object') return;

	const { success, pointsCost } = result as { success?: boolean; pointsCost?: number };
	if (success && pointsCost) {
		scoring.deduct(roomCode, playerId, pointsCost).catch(() => {});
		log.info('Hint score deducted', { playerId, cost: pointsCost });
	}
}

/**
 * Create tool call handler for streaming
 */
function createToolHandler(
	ctx: ChatContext,
	toolCallResults: ToolCallResult[]
): ({ toolCalls, toolResults }: { toolCalls?: unknown[]; toolResults?: unknown[] }) => Promise<void> {
	return async ({ toolCalls, toolResults }) => {
		if (!toolCalls?.length) return;

		log.debug('Tool calls completed', {
			playerId: ctx.playerId,
			tools: toolCalls.map((t) => (t as { toolName: string }).toolName)
		});

		toolCalls.forEach((tc, i) => {
			const toolCall = tc as { toolName: string };
			const toolResult = toolResults?.[i] as { result?: unknown } | undefined;
			const result = toolResult && 'result' in toolResult ? toolResult.result : undefined;

			toolCallResults.push({ toolName: toolCall.toolName, result });

			if (toolCall.toolName === 'get_hint') {
				processHintResult(result, ctx.roomCode, ctx.playerId);
			}
		});
	};
}

/**
 * Post-stream cleanup: save message, sync code, track time
 */
function onStreamComplete(
	fullContent: string,
	ctx: ChatContext,
	messageId: string,
	startTime: number,
	sandboxReady: boolean
): void {
	const elapsed = Date.now() - startTime;
	addPlayerWaitTime(ctx.playerId, ctx.roundId, elapsed);

	// Save without tool markers
	const cleanContent = fullContent.replace(/<!--TOOL_CALLS:.*?-->/g, '');
	saveChatMessage(ctx.playerId, ctx.roundId, {
		id: messageId,
		role: 'assistant',
		content: cleanContent
	});

	// Sync final code to sandbox
	if (sandboxReady) {
		const code = extractCodeBlock(fullContent);
		if (code) {
			SandboxManager.updatePlayerCode(ctx.roomId, ctx.playerId, code).catch((err) =>
				log.debug('Code sync failed', { error: String(err) })
			);
		}
	}
}

/**
 * Extract user-friendly error message from AI SDK errors
 */
function getErrorMessage(err: unknown): string {
	// Handle RetryError which wraps actual API errors
	const retryError = err as { lastError?: unknown; reason?: string };
	const innerError = retryError.lastError || err;
	const error = innerError as { statusCode?: number; responseBody?: string; message?: string };

	// Rate limit error (429)
	if (error.statusCode === 429 || retryError.reason === 'maxRetriesExceeded') {
		return "The AI model is temporarily rate-limited. Please wait a few seconds and try again.";
	}

	// Try to parse OpenRouter error body
	if (error.responseBody) {
		try {
			const body = JSON.parse(error.responseBody);
			if (body.error?.code === 429) {
				return "The AI model is temporarily rate-limited. Please wait a few seconds and try again.";
			}
			if (body.error?.message) {
				// Clean up the message for user
				const msg = body.error.message;
				if (msg.includes('rate-limited')) {
					return "The AI model is temporarily rate-limited. Please wait a few seconds and try again.";
				}
				return `AI error: ${msg}`;
			}
		} catch {
			// Ignore parse errors
		}
	}

	// Check message for rate limit mentions
	const message = String(error.message || err);
	if (message.toLowerCase().includes('rate') || message.includes('429')) {
		return "Rate limit reached. Please wait a few seconds and try again.";
	}

	return "Something went wrong with the AI. Please try again.";
}

/**
 * Build the streaming response
 */
function createResponseStream(
	textStream: AsyncIterable<string>,
	ctx: ChatContext,
	toolCallResults: ToolCallResult[],
	messageId: string,
	startTime: number
): ReadableStream {
	const encoder = new TextEncoder();
	let fullContent = '';
	const sandboxReady = SandboxManager.isReady(ctx.roomId);

	return new ReadableStream({
		async start(controller) {
			try {
				for await (const text of textStream) {
					fullContent += text;
					controller.enqueue(encoder.encode(text));
				}

				// Inject tool markers if any
				if (toolCallResults.length > 0) {
					const marker = `\n\n<!--TOOL_CALLS:${JSON.stringify(toolCallResults)}-->`;
					fullContent += marker;
					controller.enqueue(encoder.encode(marker));
				}

				controller.close();
			} catch (err) {
				log.error('Stream error', { error: String(err), playerId: ctx.playerId });

				// Send user-friendly error message
				const errorMessage = getErrorMessage(err);
				fullContent = errorMessage;
				controller.enqueue(encoder.encode(errorMessage));
				controller.close();
			} finally {
				onStreamComplete(fullContent, ctx, messageId, startTime, sandboxReady);
			}
		}
	});
}

/**
 * Check if hint tool should be available
 */
function shouldEnableHintTool(message: string): boolean {
	return message.toLowerCase().includes('hint');
}

/**
 * Stream a chat response to the client
 */
export function streamChatResponse(ctx: ChatContext): Response {
	const startTime = Date.now();
	const messageId = nanoid();
	const toolCallResults: ToolCallResult[] = [];

	const lastMessage = ctx.messages.findLast((m) => m.role === 'user')?.content ?? '';
	const useHintTool = shouldEnableHintTool(lastMessage);

	const tools = useHintTool
		? getToolsForAI({
			playerId: ctx.playerId,
			challengeId: ctx.challenge?.id || 'unknown',
			referenceCode: ctx.challenge?.referenceCode || '',
			playerScore: ctx.playerScore
		})
		: undefined;

	const result = streamText({
		model: openrouter(ctx.model ?? DEFAULT_MODEL),
		system: getCodingAssistantPrompt(ctx.language),
		messages: ctx.messages,
		maxOutputTokens: CHAT_LIMITS.maxOutputTokens,
		tools,
		toolChoice: useHintTool ? 'auto' : undefined,
		stopWhen: useHintTool ? stepCountIs(3) : undefined,
		onStepFinish: createToolHandler(ctx, toolCallResults)
	});

	const stream = createResponseStream(result.textStream, ctx, toolCallResults, messageId, startTime);

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'X-Message-Id': messageId
		}
	});
}
