<script lang="ts">
	import { onMount } from 'svelte';
	import type { Challenge, PublicChallenge } from '$lib/types/game';
	import { REFERENCE_COMPONENTS } from './challenges';

	let { challenge }: { challenge: Challenge | PublicChallenge } = $props();

	let ReferenceComponent = $derived(REFERENCE_COMPONENTS[challenge.id]);

	// Animated props to show different states - use derived for initial, then update via animation
	let animatedProps = $state<Record<string, unknown>>({});
	let animationFrame = $state(0);

	// Reset animated props when challenge changes
	$effect(() => {
		animatedProps = { ...challenge.defaultProps };
	});

	// Animate props based on challenge.animateProps metadata
	onMount(() => {
		const animateConfig = challenge.animateProps;
		if (!animateConfig || Object.keys(animateConfig).length === 0) return;

		const interval = setInterval(() => {
			animationFrame = (animationFrame + 1) % 100;
			// Smooth sine wave normalized to 0-1
			const t = (Math.sin(animationFrame * 0.063) + 1) / 2;

			const newProps = { ...challenge.defaultProps };
			for (const [key, [min, max]] of Object.entries(animateConfig)) {
				newProps[key] = Math.round(min + (max - min) * t);
			}
			animatedProps = newProps;
		}, 50);

		return () => clearInterval(interval);
	});
</script>

<div class="border border-neutral-800 bg-[#0a0a0a] overflow-hidden">
	<div class="px-3 py-2 bg-neutral-900 border-b border-neutral-800">
		<span class="text-[10px] font-semibold text-orange-500 tracking-wide"
			>RECREATE THIS BY CHATTING WITH AI</span
		>
	</div>

	<div
		class="px-6 py-8 flex justify-center items-center min-h-[180px] bg-gradient-to-b from-[#0a0a0a] to-[#111]"
	>
		{#if ReferenceComponent}
			<div class="transition-transform duration-200 hover:scale-[1.02]">
				<ReferenceComponent {...animatedProps} />
			</div>
		{:else}
			<span class="text-neutral-600 text-sm">Reference not available</span>
		{/if}
	</div>

	<div class="px-3 py-2.5 bg-neutral-900 border-t border-neutral-800 flex items-center gap-2">
		<span class="text-sm">👆</span>
		<span class="text-xs text-neutral-500">Interactive! Try clicking & hovering</span>
	</div>
</div>
