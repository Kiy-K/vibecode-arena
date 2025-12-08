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
 * In E2E_SKIP_SANDBOX mode, uses dummy values for API keys.
 */
function validateEnv() {
	const skipSandbox = dynamicEnv.E2E_SKIP_SANDBOX === 'true';

	// Use dummy values for E2E tests that skip sandbox
	const e2bKey = dynamicEnv.E2B_API_KEY || (skipSandbox ? 'e2b_dummy_key_for_tests' : undefined);
	const openrouterKey =
		dynamicEnv.OPENROUTER_API_KEY || (skipSandbox ? 'sk-or-dummy_key_for_tests' : undefined);

	const result = v.safeParse(envSchema, {
		E2B_API_KEY: e2bKey,
		OPENROUTER_API_KEY: openrouterKey
	});

	if (!result.success) {
		const errors = result.issues.map((issue) => `  - ${issue.message}`).join('\n');
		throw new Error(`Environment validation failed:\n${errors}`);
	}

	return result.output;
}

export const env = validateEnv();
