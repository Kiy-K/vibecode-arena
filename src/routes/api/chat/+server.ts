import type { RequestHandler } from './$types';
import { nanoid } from 'nanoid';

import { json } from '@sveltejs/kit';
import { streamText, stepCountIs } from 'ai';

import { openrouter, CHAT_LIMITS, DEFAULT_MODEL } from '$lib/server/ai/config';
import { getCodingAssistantPrompt } from '$lib/server/ai/prompts';
import { getToolsForAI, HINT_COST } from '$lib/server/ai/tools';
import { validateChatRequest, sanitizeMessages, trackPrompt } from '$lib/server/ai/validation';
import { addPlayerWaitTime } from '$lib/server/ratelimit';
import { saveChatMessage } from '$lib/server/chat-store';
import { SandboxManager } from '$lib/server/e2b';
import { GameService } from '$lib/server/game';
import { extractCodeBlock } from '$lib/utils/code';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ChatAPI');

/**
 * Handle POST requests to the chat API endpoint
 * used by the frontend to send chat messages and receive AI responses.
 *
 * Streams tokens to both client AND sandbox file for instant preview.
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

	// Save the user message to chat store
	saveChatMessage(data.playerId, roundId, {
		id: nanoid(),
		role: 'user',
		content: lastUserMessage
	});

	trackPrompt(data.playerId, roundId);

	const startTime = Date.now();

	// Prepare context for tools (hint tool needs challenge reference)
	// Server-side always has full Challenge with referenceCode
	const challenge = room.currentChallenge as import('$lib/types/game').Challenge | undefined;
	const challengeId = challenge?.id || 'unknown';
	const referenceCode = challenge?.referenceCode || '';

	// Get player's current score for hint eligibility
	const player = room.players.find((p) => p.id === data.playerId);
	const playerScore = player?.score ?? 0;

	// Only provide hint tool if user explicitly mentions "hint" in their message - bad practice but as we are really using these dumber models it is necessary
	const userMentionsHint = lastUserMessage.toLowerCase().includes('hint');
	const tools = userMentionsHint
		? getToolsForAI({
				playerId: data.playerId,
				challengeId,
				referenceCode,
				playerScore
			})
		: undefined;

	// Collect tool calls for injection into stream
	const toolCallResults: Array<{ toolName: string; result: unknown }> = [];

	const result = streamText({
		model: openrouter(data.model ?? DEFAULT_MODEL),
		system: getCodingAssistantPrompt(data.language),
		messages,
		maxOutputTokens: CHAT_LIMITS.maxOutputTokens,
		tools,
		toolChoice: userMentionsHint ? 'auto' : undefined,
		stopWhen: userMentionsHint ? stepCountIs(3) : undefined, // Only need multi-step for tool calls
		onStepFinish: async ({ toolCalls, toolResults }) => {
			if (toolCalls && toolCalls.length > 0) {
				log.debug('Tool calls completed', {
					playerId: data.playerId,
					tools: toolCalls.map((t) => t.toolName)
				});
				// Store tool results for injection
				toolCalls.forEach((tc, i) => {
					const toolResult = toolResults?.[i];
					const result = toolResult && 'result' in toolResult ? toolResult.result : undefined;
					toolCallResults.push({
						toolName: tc.toolName,
						result
					});

					// Deduct score when hint is successfully used
					if (tc.toolName === 'get_hint' && result && typeof result === 'object') {
						const hintResult = result as { success?: boolean; pointsCost?: number };
						if (hintResult.success && hintResult.pointsCost) {
							GameService.deductScore(room.id, data.playerId, hintResult.pointsCost);
							log.info('Hint score deducted', {
								playerId: data.playerId,
								cost: hintResult.pointsCost
							});
						}
					}
				});
			}
		}
	});

	// Create a custom readable stream from the text stream
	const textStream = result.textStream;
	const encoder = new TextEncoder();
	let fullContent = '';
	const assistantMessageId = nanoid();

	// Check if sandbox is ready for this room
	const sandboxReady = SandboxManager.isReady(room.id);

	const customStream = new ReadableStream({
		async start(controller) {
			try {
				for await (const text of textStream) {
					fullContent += text;
					controller.enqueue(encoder.encode(text));
				}

				// Inject tool call markers at end of stream if any tools were used
				if (toolCallResults.length > 0) {
					const marker = `\n\n<!--TOOL_CALLS:${JSON.stringify(toolCallResults)}-->`;
					fullContent += marker;
					controller.enqueue(encoder.encode(marker));
				}

				controller.close();
			} catch (err) {
				controller.error(err);
			} finally {
				// Stream complete - record elapsed time as wait time
				const elapsed = Date.now() - startTime;
				addPlayerWaitTime(data.playerId, roundId, elapsed);

				// Save the assistant message to chat store (without tool markers)
				const contentToSave = fullContent.replace(/<!--TOOL_CALLS:.*?-->/g, '');
				saveChatMessage(data.playerId, roundId, {
					id: assistantMessageId,
					role: 'assistant',
					content: contentToSave
				});

				// Final code write to ensure completeness
				if (sandboxReady) {
					const finalCode = extractCodeBlock(fullContent);
					if (finalCode) {
						SandboxManager.updatePlayerCode(room.id, data.playerId, finalCode).catch(() => {});
					}
				}
			}
		}
	});

	// Return the assistant message ID in a custom header so client can reference it
	const headers = new Headers();
	headers.set('Content-Type', 'text/plain; charset=utf-8');
	headers.set('X-Message-Id', assistantMessageId);

	return new Response(customStream, { headers });
};
