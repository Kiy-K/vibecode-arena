import type { Challenge, ChallengeCategory } from '$lib/types/game';

// Auto-import all challenge components (raw source)
const challengeFiles = import.meta.glob('$lib/components/challenges/*.svelte', {
	query: '?raw',
	eager: true,
	import: 'default'
}) as Record<string, string>;

// Parse metadata from component source
function parseChallenge(source: string): Challenge | null {
	const metaMatch = source.match(/<!--([\s\S]*?)-->/);
	if (!metaMatch) return null;

	const meta = metaMatch[1];
	const get = (key: string): string => {
		const match = meta.match(new RegExp(`@${key}:\\s*(.+)`));
		return match?.[1]?.trim() || '';
	};

	const id = get('id');
	if (!id) return null;

	// Strip the metadata comment from source
	const referenceCode = source.replace(/<!--[\s\S]*?-->\n?/, '').trim();

	const animatePropsStr = get('animateProps');

	return {
		id,
		category: get('category') as ChallengeCategory,
		title: get('title'),
		description: get('description'),
		referenceCode,
		defaultProps: JSON.parse(get('defaultProps') || '{}'),
		animateProps: animatePropsStr ? JSON.parse(animatePropsStr) : undefined,
		timeLimit: parseInt(get('timeLimit')) || 300
	};
}

// Build challenges array from all files
export const CHALLENGES: Challenge[] = Object.values(challengeFiles)
	.map(parseChallenge)
	.filter((c): c is Challenge => c !== null);

export function getRandomChallenge(excludeIds: string[] = []): Challenge {
	const available = CHALLENGES.filter((c) => !excludeIds.includes(c.id));
	if (available.length === 0) {
		// All challenges used, reset and pick from all
		return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
	}
	return available[Math.floor(Math.random() * available.length)];
}

export function getChallengeById(id: string): Challenge | undefined {
	return CHALLENGES.find((c) => c.id === id);
}
