/**
 * Code validation for sandbox security.
 * Blocks potentially dangerous patterns in player code.
 * I know we are in the sandbox, but I still don't want players to mess with it :D.
 * - especially when we use one shared sandbox - yeah each player could have their own but i am afraid that i would bankrupt
 */
import { createLogger } from '../logger';

const log = createLogger('CodeValidator');

/** Patterns that are blocked in player code */
const BLOCKED_PATTERNS = [
	// File system access
	/import\s+.*\s+from\s+['"][./]*solutions\//i,
	/import\s*\(\s*['"][./]*solutions\//i,
	/fetch\s*\(\s*['"][./]/i,
	/fetch\s*\(\s*['"]file:/i,

	// Node.js modules that shouldn't be in Svelte components
	/import\s+.*\s+from\s+['"]fs['"]/i,
	/import\s+.*\s+from\s+['"]child_process['"]/i,
	/import\s+.*\s+from\s+['"]path['"]/i,
	/require\s*\(\s*['"]fs['"]\)/i,
	/require\s*\(\s*['"]child_process['"]\)/i,

	// Code execution
	/\beval\s*\(/i,
	/new\s+Function\s*\(/i,

	// Potentially dangerous globals
	/process\.env/i,
	/process\.exit/i,
	/__dirname/i,
	/__filename/i
];

/** Patterns that are suspicious but allowed with warning */
const SUSPICIOUS_PATTERNS = [
	/localStorage/i,
	/sessionStorage/i,
	/document\.cookie/i,
	/XMLHttpRequest/i,
	/WebSocket/i
];

export interface ValidationResult {
	valid: boolean;
	blocked?: string;
	warnings: string[];
}

/**
 * Validate player code for security issues.
 * Returns validation result with any blocked patterns or warnings.
 */
export function validatePlayerCode(code: string, playerId: string): ValidationResult {
	const warnings: string[] = [];

	// Check for blocked patterns
	for (const pattern of BLOCKED_PATTERNS) {
		if (pattern.test(code)) {
			const match = code.match(pattern)?.[0] || 'unknown';
			log.warn('Blocked dangerous pattern in player code', { playerId, pattern: match });
			return {
				valid: false,
				blocked: `Blocked pattern: ${match}`,
				warnings
			};
		}
	}

	// Check for suspicious patterns (log but allow)
	for (const pattern of SUSPICIOUS_PATTERNS) {
		if (pattern.test(code)) {
			const match = code.match(pattern)?.[0] || 'unknown';
			warnings.push(`Suspicious pattern: ${match}`);
		}
	}

	if (warnings.length > 0) {
		log.debug('Suspicious patterns in player code', { playerId, warnings });
	}

	return { valid: true, warnings };
}

/**
 * Sanitize code by removing or replacing dangerous patterns.
 * Used as a fallback if we want to allow code with modifications.
 */
export function sanitizePlayerCode(code: string): string {
	let sanitized = code;

	// Remove any attempts to import from solutions directory
	sanitized = sanitized.replace(
		/import\s+.*\s+from\s+['"][./]*solutions\/[^'"]+['"]/gi,
		'// [BLOCKED IMPORT]'
	);

	// Remove eval calls
	sanitized = sanitized.replace(/\beval\s*\([^)]*\)/gi, '/* [BLOCKED EVAL] */ null');

	// Remove new Function calls
	sanitized = sanitized.replace(
		/new\s+Function\s*\([^)]*\)/gi,
		'/* [BLOCKED FUNCTION] */ (() => {})'
	);

	return sanitized;
}
