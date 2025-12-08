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
			exclude: ['src/lib/**/*.d.ts'],
			thresholds: {
				statements: 50,
				branches: 50,
				functions: 50,
				lines: 50
			}
		}
	}
});
