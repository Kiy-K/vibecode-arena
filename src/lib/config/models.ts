export const MODELS = [
	// Cheap - enabled
	{ id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic', multiplier: 1.0, disabled: false },
	{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google', multiplier: 1.1, disabled: false },
	{ id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', provider: 'Meta', multiplier: 1.1, disabled: false },

	// Free - enabled
	{ id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder', provider: 'Qwen', multiplier: 1.15, disabled: false },
	{ id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera', provider: 'DeepSeek', multiplier: 1.2, disabled: false },

	// Disabled in production to not burn through my wallet :)
	{ id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', provider: 'Anthropic', multiplier: 0.8, disabled: true },
	{ id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'Anthropic', multiplier: 0.9, disabled: true },
	{ id: 'google/gemini-3-pro', name: 'Gemini 3 Pro', provider: 'Google', multiplier: 0.9, disabled: true },
	{ id: 'openai/gpt-5.1', name: 'GPT-5.1', provider: 'OpenAI', multiplier: 0.9, disabled: true },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export interface Model {
	id: ModelId;
	name: string;
	provider: string;
	multiplier: number;
	disabled: boolean;
}

// Get only enabled models (for backend validation)
export const ENABLED_MODEL_IDS = MODELS.filter((m) => !m.disabled).map((m) => m.id);

export function isModelEnabled(modelId: string): boolean {
	return (ENABLED_MODEL_IDS as readonly string[]).includes(modelId);
}

export const MODEL_IDS = MODELS.map((m) => m.id) as [ModelId, ...ModelId[]];

export const DEFAULT_MODEL: ModelId = 'anthropic/claude-3-haiku';

export function getModelMultiplier(modelId: ModelId): number {
	return MODELS.find((m) => m.id === modelId)?.multiplier ?? 1.0;
}
