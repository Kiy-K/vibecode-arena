/**
 * Environment variable validation.
 * Uses Valibot to ensure all required env vars are present and valid.
 * Uses dynamic imports for runtime configuration (required for Docker).
 */
import * as v from 'valibot';
import { env as dynamicEnv } from '$env/dynamic/private';

const envSchema = v.object({
	E2B_API_KEY: v.pipe(v.string(), v.minLength(1, 'E2B_API_KEY is required')),
	OPENROUTER_API_KEY: v.pipe(v.string(), v.minLength(1, 'OPENROUTER_API_KEY is required'))
});

/**
 * Validated environment variables.
 * Throws at startup if any required variable is missing.
 */
function validateEnv() {
	const result = v.safeParse(envSchema, {
		E2B_API_KEY: dynamicEnv.E2B_API_KEY,
		OPENROUTER_API_KEY: dynamicEnv.OPENROUTER_API_KEY
	});

	if (!result.success) {
		const errors = result.issues.map((issue) => `  - ${issue.message}`).join('\n');
		throw new Error(`Environment validation failed:\n${errors}`);
	}

	return result.output;
}

export const env = validateEnv();
