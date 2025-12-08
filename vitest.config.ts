import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
		environment: 'node',
		globals: true,
		alias: {
			$lib: resolve(__dirname, './src/lib'),
			'$app/environment': resolve(__dirname, './tests/mocks/app-environment.ts'),
			'$app/navigation': resolve(__dirname, './tests/mocks/app-navigation.ts'),
			'$app/stores': resolve(__dirname, './tests/mocks/app-stores.ts')
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			include: ['src/lib/**/*.ts'],
			exclude: [
				'src/lib/**/*.d.ts',
				'src/lib/types/**', // Type definitions only
				'src/lib/hooks/**', // Svelte runes - need browser/component tests
				'src/lib/server/**', // Server code - needs integration tests with real services
				'src/lib/components/**', // UI components - need component tests
				'src/lib/config/seo.ts', // SEO metadata - tested via E2E
				'src/lib/utils/confetti.ts' // Browser-only canvas animation
			],
			thresholds: {
				statements: 70,
				branches: 50,
				functions: 70,
				lines: 70
			}
		}
	}
});
