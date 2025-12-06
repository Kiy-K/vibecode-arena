import { OPENROUTER_API_KEY } from '$env/static/private';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { DEFAULT_MODEL } from '$lib/config/models';

export const openrouter = createOpenRouter({
	apiKey: OPENROUTER_API_KEY
});

// Model IDs are already in OpenRouter format, no mapping needed
export { DEFAULT_MODEL };

export const CHAT_LIMITS = {
	maxMessageLength: 8000,
	maxMessagesInContext: 20,
	maxPromptsPerRound: 15,
	maxOutputTokens: 1500,
	rateLimit: {
		windowMs: 60_000,
		maxRequests: 20
	}
} as const;
