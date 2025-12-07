import { describe, it, expect } from 'vitest';
import {
	generateRoomCode,
	ROOM_CODE_CHARS,
	ROOM_CODE_LENGTH,
	SCORING,
	GAME
} from '$lib/config/game';

describe('generateRoomCode', () => {
	it('generates code of correct length', () => {
		const code = generateRoomCode();
		expect(code).toHaveLength(ROOM_CODE_LENGTH);
	});

	it('only uses allowed characters', () => {
		for (let i = 0; i < 100; i++) {
			const code = generateRoomCode();
			for (const char of code) {
				expect(ROOM_CODE_CHARS).toContain(char);
			}
		}
	});

	it('generates unique codes', () => {
		const codes = new Set<string>();
		for (let i = 0; i < 100; i++) {
			codes.add(generateRoomCode());
		}
		// With 30 chars and 6 positions, collision is extremely unlikely
		expect(codes.size).toBe(100);
	});

	it('excludes ambiguous characters', () => {
		const ambiguous = ['0', 'O', '1', 'I', 'L'];
		for (let i = 0; i < 100; i++) {
			const code = generateRoomCode();
			for (const char of ambiguous) {
				expect(code).not.toContain(char);
			}
		}
	});
});

describe('SCORING constants', () => {
	it('has valid base score', () => {
		expect(SCORING.BASE).toBeGreaterThan(0);
	});

	it('has position bonuses in descending order', () => {
		const bonuses = SCORING.POSITION_BONUSES;
		expect(bonuses[0]).toBeGreaterThan(bonuses[1]);
		expect(bonuses[1]).toBeGreaterThan(bonuses[2]);
	});

	it('has reasonable hint cost', () => {
		expect(SCORING.HINT_COST).toBeLessThan(SCORING.BASE);
		expect(SCORING.MAX_HINTS * SCORING.HINT_COST).toBeLessThan(SCORING.BASE);
	});
});

describe('GAME constants', () => {
	it('has valid player limits', () => {
		expect(GAME.MIN_PLAYERS).toBeGreaterThanOrEqual(1);
		expect(GAME.MAX_PLAYERS).toBeGreaterThan(GAME.MIN_PLAYERS);
	});

	it('has valid default rounds', () => {
		expect(GAME.DEFAULT_ROUNDS).toBeGreaterThan(0);
	});
});
