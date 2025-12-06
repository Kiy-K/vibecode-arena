import type { RequestHandler } from './$types';
import { siteConfig } from '$lib/config/seo';

/**
 * Generate XML sitemap for search engines.
 * Only includes public, indexable pages.
 */
export const GET: RequestHandler = async () => {
	const pages = [
		{ url: '', priority: 1.0, changefreq: 'weekly' }
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
	.map(
		(page) => `  <url>
    <loc>${siteConfig.url}${page.url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600' // Cache for 1 hour
		}
	});
};
