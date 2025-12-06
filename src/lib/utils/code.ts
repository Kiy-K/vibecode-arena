/**
 * Supported code fence language identifiers.
 * These are the languages we recognize in code blocks from AI responses.
 */
const CODE_LANGUAGES = 'svelte|html|javascript|js|typescript|ts|jsx|tsx|react';

/**
 * Regex pattern for extracting complete code blocks.
 * Matches: ```language\ncode``` or ```\ncode```
 * The \n? makes the newline optional to handle edge cases.
 */
const CODE_BLOCK_REGEX = new RegExp(`\`\`\`(?:${CODE_LANGUAGES})?\\n?([\\s\\S]*?)\`\`\``);

/**
 * Regex pattern for extracting incomplete code blocks (for streaming).
 * Matches: ```language\ncode (without closing ```)
 */
const PARTIAL_CODE_BLOCK_REGEX = new RegExp(`\`\`\`(?:${CODE_LANGUAGES})?\\n([\\s\\S]+)$`);

/**
 * Extract the first code block from a message content string.
 * Used both client-side (for UI) and server-side (for submissions).
 *
 * @param content - The message content potentially containing code blocks
 * @returns The extracted code (trimmed) or null if no code block found
 */
export function extractCodeBlock(content: string): string | null {
	const match = content.match(CODE_BLOCK_REGEX);
	return match ? match[1].trim() : null;
}

/**
 * Extract code block from streaming content (may be incomplete).
 * First tries to match a complete code block, then falls back to partial.
 * Used for real-time preview updates while AI is still generating.
 *
 * @param content - The streaming content potentially containing partial code
 * @returns The extracted code (trimmed) or null if no code found
 */
export function extractStreamingCodeBlock(content: string): string | null {
	// First try complete block
	const complete = content.match(CODE_BLOCK_REGEX);
	if (complete) return complete[1].trim();

	// Fall back to partial (streaming) block
	const partial = content.match(PARTIAL_CODE_BLOCK_REGEX);
	return partial ? partial[1].trim() : null;
}
