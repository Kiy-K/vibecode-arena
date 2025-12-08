<script lang="ts">
	interface Props {
		earnedScore: number;
		timeTaken: number;
		promptsUsed: number;
		totalPlayers: number;
		submittedCount: number;
		similarityScore: number;
		feedback: string;
		formatTime: (seconds: number) => string;
	}

	let {
		earnedScore,
		timeTaken,
		promptsUsed,
		totalPlayers,
		submittedCount,
		similarityScore,
		feedback,
		formatTime
	}: Props = $props();
</script>

<div class="fixed inset-0 bg-black/90 flex items-center justify-center z-50 animate-fade-in p-4">
	<div class="text-center">
		<div class="text-6xl md:text-8xl mb-4 md:mb-6 animate-bounce">🎉</div>
		<h2 class="text-2xl md:text-4xl font-bold text-green-400 mb-2">Challenge Complete!</h2>
		<p class="text-neutral-500 mb-6 md:mb-8 text-sm md:text-base">
			You solved it in {formatTime(timeTaken)}
		</p>

		<div class="flex justify-center gap-4 md:gap-8 mb-6 md:mb-8">
			<div class="text-center">
				<div class="text-3xl md:text-5xl font-bold text-orange-400 mb-1">
					+{earnedScore}
				</div>
				<div class="text-neutral-600 text-xs md:text-sm">points</div>
			</div>
			<div class="text-center">
				<div class="text-xl md:text-3xl font-mono text-white mb-1">
					{similarityScore}/100
				</div>
				<div class="text-neutral-600 text-xs md:text-sm">similarity</div>
			</div>
			<div class="text-center">
				<div class="text-xl md:text-3xl font-mono text-white mb-1">
					{formatTime(timeTaken)}
				</div>
				<div class="text-neutral-600 text-xs md:text-sm">time</div>
			</div>
			<div class="text-center">
				<div class="text-xl md:text-3xl font-mono text-white mb-1">
					{promptsUsed}
				</div>
				<div class="text-neutral-600 text-xs md:text-sm">prompts</div>
			</div>
		</div>

		{#if feedback}
			<div class="max-w-md mx-auto mb-6 px-4 py-3 bg-neutral-900 border border-neutral-800">
				<p class="text-sm text-neutral-300 leading-relaxed">{feedback}</p>
			</div>
		{/if}

		<div class="text-neutral-600 text-sm border-t border-neutral-800 pt-6">
			{#if submittedCount < totalPlayers}
				waiting for {totalPlayers - submittedCount} more player{totalPlayers - submittedCount === 1
					? ''
					: 's'}...
			{:else}
				all players finished!
			{/if}
		</div>
	</div>
</div>
