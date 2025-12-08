import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		},
		rules: {
			// Svelte 5 runes use `let` for $props() destructuring
			'prefer-const': 'off',
			// Keys help Svelte track items efficiently
			'svelte/require-each-key': 'error',
			// We use @html with trusted content only
			'svelte/no-at-html-tags': 'off',
			// Too strict for simple apps - we don't need resolve() everywhere
			'svelte/no-navigation-without-resolve': 'off',
			// We intentionally use $state + $effect for local state synced from props
			'svelte/prefer-writable-derived': 'off',
			// Allow underscore-prefixed unused vars in Svelte files
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			]
		}
	},
	{
		files: ['**/*.ts', '**/*.js'],
		rules: {
			// TypeScript
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'inline-type-imports' }
			],

			// General
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'prefer-const': 'error',
			'no-var': 'error',
			eqeqeq: ['error', 'always', { null: 'ignore' }]
		}
	},
	{
		// Server files can use console.log for logging
		files: ['**/server/**/*.ts', '**/+server.ts'],
		rules: {
			'no-console': 'off'
		}
	},
	{
		// Tests and sandbox build scripts can use console.log
		files: ['tests/**/*.ts', 'sandbox/**/*.ts', 'sandbox/**/*.js'],
		rules: {
			'no-console': 'off',
			'@typescript-eslint/no-explicit-any': 'off'
		}
	},
	{
		ignores: [
			'.svelte-kit/**',
			'.wrangler/**',
			'build/**',
			'node_modules/**',
			'template/**',
			'patches/**',
			'playwright-report/**',
			'worker/dist/**',
			'sandbox/files/**',
			'*.config.js',
			'*.config.ts',
			// Svelte 5 runes files need svelte parser, not regular TS
			'**/*.svelte.ts',
			// ESLint's Svelte parser can't handle @html with JSON speculations rules script
			'src/routes/+page.svelte'
		]
	}
];
