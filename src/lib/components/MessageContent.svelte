<script lang="ts">
	import { Highlight } from 'svelte-highlight';
	import { xml } from 'svelte-highlight/languages';
	import 'highlight.js/styles/github-dark.css';

	let { content }: { content: string } = $props();

	type Part = { type: 'text'; content: string } | { type: 'code'; content: string };

	/**
	 * Sanitize text content and convert newlines to <br> tags.
	 * Strips all HTML tags to prevent XSS attacks from AI-generated content.
	 */
	function sanitizeText(text: string): string {
		// Strip all HTML tags (we don't allow any HTML in chat messages)
		const clean = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		// Then convert newlines to <br> tags
		return clean.replace(/\n/g, '<br>');
	}

	const parts = $derived.by(() => {
		const segments = content.split(/(```[\s\S]*?```)/g);
		const result: Part[] = [];

		for (const segment of segments) {
			const codeMatch = segment.match(/```\w*\n?([\s\S]*?)```/);
			if (codeMatch) {
				result.push({ type: 'code', content: codeMatch[1].trim() });
			} else if (segment.trim()) {
				result.push({ type: 'text', content: segment });
			}
		}

		return result;
	});
</script>

<div class="message-content">
	{#each parts as part, i (i)}
		{#if part.type === 'code'}
			<div class="my-3 bg-[#0a0a0a] border border-neutral-800 overflow-hidden">
				<div
					class="px-3 py-1.5 text-[10px] text-neutral-500 bg-neutral-900/50 border-b border-neutral-800 uppercase tracking-wider"
				>
					svelte
				</div>
				<div class="code-block">
					<Highlight language={xml} code={part.content} />
				</div>
			</div>
		{:else}
			<span>{@html sanitizeText(part.content)}</span>
		{/if}
	{/each}
</div>

<style>
	.message-content :global(pre) {
		margin: 0;
		padding: 1rem;
		overflow-x: auto;
		font-size: 0.875rem;
		line-height: 1.625;
		background: transparent !important;
	}
	.message-content :global(code) {
		font-family: 'JetBrains Mono', monospace;
		background: transparent !important;
	}
	.code-block :global(.hljs) {
		background: transparent !important;
	}
</style>
