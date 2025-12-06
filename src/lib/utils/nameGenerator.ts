import { nanoid } from 'nanoid';

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

const NOUNS = [
	'coder',
	'hacker',
	'wizard',
	'dev',
	'byte',
	'bit',
	'node',
	'stack',
	'loop'
];

export function generateRandomName(): string {
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return `${adj}_${noun}_${nanoid(4)}`;
}
