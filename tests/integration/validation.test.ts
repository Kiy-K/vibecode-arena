import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { ENABLED_MODEL_IDS } from '$lib/config/models';
import { createRoomSchema, joinRoomSchema } from '$lib/validation/schemas';
import { ROOM_CODE_CHARS } from '$lib/config/game';

describe('Form Validation Schemas', () => {
	describe('createRoomSchema', () => {
		it('accepts valid input', () => {
			const result = v.safeParse(createRoomSchema, {
				name: 'TestPlayer',
				model: ENABLED_MODEL_IDS[0]
			});
			expect(result.success).toBe(true);
		});

		it('rejects empty name', () => {
			const result = v.safeParse(createRoomSchema, {
				name: '',
				model: ENABLED_MODEL_IDS[0]
			});
			expect(result.success).toBe(false);
		});

		it('rejects name over 20 characters', () => {
			const result = v.safeParse(createRoomSchema, {
				name: 'A'.repeat(21),
				model: ENABLED_MODEL_IDS[0]
			});
			expect(result.success).toBe(false);
		});

		it('rejects invalid model', () => {
			const result = v.safeParse(createRoomSchema, {
				name: 'TestPlayer',
				model: 'invalid/model'
			});
			expect(result.success).toBe(false);
		});

		it('accepts all enabled models', () => {
			for (const modelId of ENABLED_MODEL_IDS) {
				const result = v.safeParse(createRoomSchema, {
					name: 'Player',
					model: modelId
				});
				expect(result.success, `Model ${modelId} should be valid`).toBe(true);
			}
		});
	});

	describe('joinRoomSchema', () => {
		const validCode = 'ABC123';

		it('accepts valid input', () => {
			const result = v.safeParse(joinRoomSchema, {
				name: 'JoiningPlayer',
				model: ENABLED_MODEL_IDS[0],
				code: validCode
			});
			expect(result.success).toBe(true);
		});

		it('accepts minimum length name', () => {
			const result = v.safeParse(joinRoomSchema, {
				name: 'A',
				model: ENABLED_MODEL_IDS[0],
				code: validCode
			});
			expect(result.success).toBe(true);
		});

		it('accepts maximum length name', () => {
			const result = v.safeParse(joinRoomSchema, {
				name: 'A'.repeat(20),
				model: ENABLED_MODEL_IDS[0],
				code: validCode
			});
			expect(result.success).toBe(true);
		});

		it('requires exactly 6 character code', () => {
			const shortCode = v.safeParse(joinRoomSchema, {
				name: 'Player',
				model: ENABLED_MODEL_IDS[0],
				code: 'ABC12'
			});
			expect(shortCode.success).toBe(false);

			const longCode = v.safeParse(joinRoomSchema, {
				name: 'Player',
				model: ENABLED_MODEL_IDS[0],
				code: 'ABC1234'
			});
			expect(longCode.success).toBe(false);
		});

		it('rejects missing code', () => {
			const result = v.safeParse(joinRoomSchema, {
				name: 'Player',
				model: ENABLED_MODEL_IDS[0]
			});
			expect(result.success).toBe(false);
		});
	});
});

describe('Room Code Validation', () => {
	it('all valid room code chars are unambiguous', () => {
		const ambiguous = ['0', 'O', '1', 'I', 'L'];
		for (const char of ambiguous) {
			expect(ROOM_CODE_CHARS).not.toContain(char);
		}
	});

	it('room code chars are uppercase', () => {
		for (const char of ROOM_CODE_CHARS) {
			if (char.match(/[A-Z]/)) {
				expect(char).toBe(char.toUpperCase());
			}
		}
	});
});
