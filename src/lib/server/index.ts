/**
 * Server-side barrel exports.
 * Re-exports all server modules for cleaner imports.
 */

// E2B
export { SandboxManager, startRoomSandbox, previewCode } from './e2b';

// AI
export { openrouter, CHAT_LIMITS, DEFAULT_MODEL } from './ai/config';
export { getCodingAssistantPrompt, getJudgePrompt } from './ai/prompts';
export {
	validateChatRequest,
	sanitizeMessages,
	trackPrompt,
	type ChatRequest,
	type ValidationResult
} from './ai/validation';

// Utilities
export { calculateScore } from './scoring';
export { createLogger, logger } from './logger';
export { env } from './env';
export {
	checkRateLimit,
	getPlayerPromptCount,
	incrementPlayerPrompt,
	resetPlayerPrompts,
	getPlayerWaitTime,
	addPlayerWaitTime,
	resetPlayerWaitTime,
	type RateLimitConfig
} from './ratelimit';

// Chat Store
export {
	getChatHistory,
	saveChatMessage,
	clearChatHistory,
	getPromptsUsed,
	getMessage,
	getCodeFromMessage
} from './chat-store';

// Runner
export { runCode } from './runner';

// Challenges
export {
	getShuffledChallenges,
	CHALLENGES,
	getChallengeById
} from './challenges';
