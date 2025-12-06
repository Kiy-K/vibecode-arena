import type { Handle } from '@sveltejs/kit';

/**
 * Security headers for all responses.
 * These headers help protect against common web vulnerabilities.
 */
const securityHeaders: Record<string, string> = {
	// Prevent MIME type sniffing
	'X-Content-Type-Options': 'nosniff',

	// Enable browser XSS filter (legacy, but still useful for older browsers)
	'X-XSS-Protection': '1; mode=block',

	// Control referrer information
	'Referrer-Policy': 'strict-origin-when-cross-origin',

	// Content Security Policy
	'Content-Security-Policy': [
		"default-src 'self'",
		// Allow inline scripts for Svelte and highlight.js
		"script-src 'self' 'unsafe-inline'",
		// Allow inline styles for Tailwind, highlight.js, and Google Fonts
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		// Allow images from self and E2B sandbox hosts
		"img-src 'self' data: blob: https://*.e2b.app",
		// Allow connections to self and E2B
		"connect-src 'self' https://*.e2b.app wss://*.e2b.app",
		// Allow fonts from self and Google Fonts
		"font-src 'self' https://fonts.gstatic.com",
		// Allow frames from E2B sandbox hosts for preview
		"frame-src https://*.e2b.app",
		// Prevent form submissions to external sites
		"form-action 'self'",
		// Prevent embedding in frames on other sites
		"frame-ancestors 'none'"
	].join('; ')
};

/**
 * SvelteKit server hook to add security headers to all responses.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Add security headers to all responses
	for (const [header, value] of Object.entries(securityHeaders)) {
		response.headers.set(header, value);
	}

	return response;
};
