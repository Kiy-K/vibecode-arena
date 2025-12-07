import { describe, it, expect } from 'vitest';
import { extractCodeBlock, extractStreamingCodeBlock, isCodeBlockComplete } from '$lib/utils/code';

describe('extractCodeBlock', () => {
	it('extracts code from svelte fence', () => {
		const content = 'Here is some code:\n```svelte\n<div>Hello</div>\n```\nMore text';
		expect(extractCodeBlock(content)).toBe('<div>Hello</div>');
	});

	it('extracts code from html fence', () => {
		const content = '```html\n<p>Test</p>\n```';
		expect(extractCodeBlock(content)).toBe('<p>Test</p>');
	});

	it('extracts code from generic fence', () => {
		const content = '```\nsome code\n```';
		expect(extractCodeBlock(content)).toBe('some code');
	});

	it('returns null when no code block', () => {
		expect(extractCodeBlock('just plain text')).toBeNull();
	});

	it('extracts first code block only', () => {
		const content = '```svelte\n<First/>\n```\n```svelte\n<Second/>\n```';
		expect(extractCodeBlock(content)).toBe('<First/>');
	});

	it('handles multiline code', () => {
		const content = '```svelte\n<script>\n  let x = 1;\n</script>\n<div>{x}</div>\n```';
		expect(extractCodeBlock(content)).toBe('<script>\n  let x = 1;\n</script>\n<div>{x}</div>');
	});

	it('trims whitespace', () => {
		const content = '```svelte\n  \n<div/>\n  \n```';
		expect(extractCodeBlock(content)).toBe('<div/>');
	});
});

describe('extractStreamingCodeBlock', () => {
	it('extracts complete code block', () => {
		const content = '```svelte\n<div>Done</div>\n```';
		expect(extractStreamingCodeBlock(content)).toBe('<div>Done</div>');
	});

	it('extracts partial code block (no closing fence)', () => {
		const content = 'Here is code:\n```svelte\n<div>Streaming...';
		expect(extractStreamingCodeBlock(content)).toBe('<div>Streaming...');
	});

	it('returns null when no code started', () => {
		expect(extractStreamingCodeBlock('just text')).toBeNull();
	});

	it('prefers complete block over partial', () => {
		const content = '```svelte\n<Complete/>\n```\n```svelte\n<Partial>';
		expect(extractStreamingCodeBlock(content)).toBe('<Complete/>');
	});
});

describe('isCodeBlockComplete', () => {
	it('returns true for complete block', () => {
		expect(isCodeBlockComplete('```svelte\n<div/>\n```')).toBe(true);
	});

	it('returns false for partial block', () => {
		expect(isCodeBlockComplete('```svelte\n<div>')).toBe(false);
	});

	it('returns false for no block', () => {
		expect(isCodeBlockComplete('plain text')).toBe(false);
	});
});
