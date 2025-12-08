/**
 * SEO and meta configuration for Vibecode Arena.
 * Centralized config for consistent branding across all pages.
 */

export const siteConfig = {
	name: 'vibecode arena',
	shortName: 'vibecode',
	description:
		'compete in real-time ai-assisted coding challenges. race against other developers to build ui components using ai prompts. show your prompting skills!',
	tagline: 'show your prompting skills!',

	// URLs - update these for production
	url: 'https://vibecodearena.dev',
	ogImage: '/og-image.png',

	// Branding
	themeColor: '#0a0a0a',
	backgroundColor: '#0a0a0a',

	// Social
	twitter: '@vibecodearena_dev',
	github: 'https://github.com/bxxf/vibecode-arena',

	// App info
	author: 'Filip Brebera',
	keywords: [
		'AI coding',
		'coding competition',
		'prompt engineering',
		'AI prompts',
		'coding game',
		'multiplayer coding',
		'UI components',
		'developer game',
		'AI assistant',
		'code challenge',
		'real-time coding'
	]
} as const;

/**
 * Generate full meta tags for a page.
 */
export function getPageMeta(options: {
	title?: string;
	description?: string;
	image?: string;
	url?: string;
	type?: 'website' | 'article';
	noindex?: boolean;
}) {
	const title = options.title
		? `${options.title} | ${siteConfig.name}`
		: `${siteConfig.name} - ${siteConfig.tagline}`;

	const description = options.description || siteConfig.description;
	const image = options.image || siteConfig.ogImage;
	const url = options.url || siteConfig.url;
	const type = options.type || 'website';

	return {
		title,
		description,
		keywords: siteConfig.keywords.join(', '),
		author: siteConfig.author,
		robots: options.noindex ? 'noindex, nofollow' : 'index, follow',

		// Open Graph
		og: {
			title,
			description,
			image: image.startsWith('http') ? image : `${siteConfig.url}${image}`,
			url,
			type,
			siteName: siteConfig.name,
			locale: 'en_US'
		},

		// Twitter Card
		twitter: {
			card: 'summary_large_image',
			site: siteConfig.twitter,
			title,
			description,
			image: image.startsWith('http') ? image : `${siteConfig.url}${image}`
		}
	};
}

/**
 * JSON-LD structured data for the website.
 */
export function getWebsiteSchema() {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: siteConfig.name,
		description: siteConfig.description,
		url: siteConfig.url,
		applicationCategory: 'Game',
		operatingSystem: 'Web Browser',
		offers: {
			'@type': 'Offer',
			price: '0',
			priceCurrency: 'USD'
		},
		author: {
			'@type': 'Organization',
			name: siteConfig.author
		}
	};
}

/**
 * JSON-LD for a game/competition page.
 */
export function getGameSchema(roomCode: string) {
	return {
		'@context': 'https://schema.org',
		'@type': 'Game',
		name: `${siteConfig.name} - Room ${roomCode}`,
		description: 'Real-time AI-assisted coding competition',
		url: `${siteConfig.url}/${roomCode}`,
		numberOfPlayers: {
			'@type': 'QuantitativeValue',
			minValue: 1,
			maxValue: 10
		},
		gameItem: {
			'@type': 'Thing',
			name: 'UI Component Challenge'
		}
	};
}
