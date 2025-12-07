import { describe, it, expect } from 'vitest';
import { validatePlayerCode, sanitizePlayerCode } from '$lib/server/e2b/validate-code';

describe('validatePlayerCode', () => {
	const playerId = 'test-player';

	describe('blocks dangerous patterns', () => {
		it('blocks imports from solutions directory', () => {
			const code = `import Something from './solutions/other.svelte'`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
			expect(result.blocked).toContain('Blocked pattern');
		});

		it('blocks dynamic imports from solutions', () => {
			const code = `const mod = await import('./solutions/hack.js')`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});

		it('blocks fs module import', () => {
			const code = `import fs from 'fs'`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});

		it('blocks child_process import', () => {
			const code = `import { exec } from 'child_process'`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});

		it('blocks require fs', () => {
			const code = `const fs = require('fs')`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});

		it('blocks eval calls', () => {
			const code = `eval('alert(1)')`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});

		it('blocks new Function', () => {
			const code = `const fn = new Function('return 1')`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});

		it('blocks process.env access', () => {
			const code = `const key = process.env.SECRET`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});

		it('blocks process.exit', () => {
			const code = `process.exit(1)`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});

		it('blocks file:// fetch', () => {
			const code = `fetch('file:///etc/passwd')`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(false);
		});
	});

	describe('allows safe patterns', () => {
		it('allows normal Svelte component', () => {
			const code = `
<script>
  let count = 0;
</script>
<button on:click={() => count++}>{count}</button>
`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(true);
		});

		it('allows safe imports', () => {
			const code = `import { onMount } from 'svelte'`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(true);
		});

		it('allows fetch to external URLs', () => {
			const code = `fetch('https://api.example.com/data')`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(true);
		});
	});

	describe('warns about suspicious patterns', () => {
		it('warns about localStorage', () => {
			const code = `localStorage.setItem('key', 'value')`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(true);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toContain('localStorage');
		});

		it('warns about WebSocket', () => {
			const code = `new WebSocket('ws://example.com')`;
			const result = validatePlayerCode(code, playerId);
			expect(result.valid).toBe(true);
			expect(result.warnings.some(w => w.includes('WebSocket'))).toBe(true);
		});
	});
});

describe('sanitizePlayerCode', () => {
	it('removes solution imports', () => {
		const code = `import Hack from './solutions/other.svelte'`;
		const sanitized = sanitizePlayerCode(code);
		expect(sanitized).toContain('[BLOCKED IMPORT]');
		expect(sanitized).not.toContain('solutions/other.svelte');
	});

	it('removes eval calls', () => {
		const code = `const result = eval('1+1')`;
		const sanitized = sanitizePlayerCode(code);
		expect(sanitized).toContain('[BLOCKED EVAL]');
		expect(sanitized).not.toContain("eval('1+1')");
	});

	it('removes new Function', () => {
		const code = `const fn = new Function('return 1')`;
		const sanitized = sanitizePlayerCode(code);
		expect(sanitized).toContain('[BLOCKED FUNCTION]');
	});

	it('preserves safe code', () => {
		const code = `<div>Hello World</div>`;
		const sanitized = sanitizePlayerCode(code);
		expect(sanitized).toBe(code);
	});
});
