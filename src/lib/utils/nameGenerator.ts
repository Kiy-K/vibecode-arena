/**
 * Random name generator for player nicknames.
 */

import { nanoid } from 'nanoid';

/** Adjectives for name generation */
const ADJECTIVES = [
	'swift',
	'cyber',
	'neon',
	'turbo',
	'pixel',
	'quantum',
	'hyper',
	'ultra',
	'mega',
	'super'
];

/** Nouns for name generation */
const NOUNS = ['coder', 'hacker', 'wizard', 'dev', 'byte', 'bit', 'node', 'stack', 'loop'];

/**
 * Generate a random player name.
 * Format: adjective_noun_xxxx (e.g., "swift_coder_a1b2")
 * @returns Random player name
 */
export function generateRandomName(): string {
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return `${adj}_${noun}_${nanoid(4)}`;
}
