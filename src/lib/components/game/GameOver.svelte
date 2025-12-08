<!--
  GameOver - Final leaderboard and results screen.
  Shows podium, rankings, and play again option.
-->
<script lang="ts">
	import type { PublicPlayer } from '$lib/types/game';

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { MODELS } from '$lib/config/models';

	import { fireSuccessConfetti } from '$lib/utils/confetti';

	interface Props {
		players: PublicPlayer[];
		currentPlayerId?: string;
	}

	let { players, currentPlayerId }: Props = $props();

	const sortedPlayers = $derived([...players].sort((a, b) => b.score - a.score));

	// Top 3 for podium
	const podiumPlayers = $derived(sortedPlayers.slice(0, 3));
	const otherPlayers = $derived(sortedPlayers.slice(3));

	// Check if current player won
	const currentPlayerWon = $derived(currentPlayerId && sortedPlayers[0]?.id === currentPlayerId);

	function getModelName(modelId: string): string {
		return MODELS.find((m) => m.id === modelId)?.name ?? modelId;
	}

	function getMedalEmoji(rank: number): string {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return '';
	}

	function getRankStyle(rank: number): {
		border: string;
		bg: string;
		accent: string;
		glow: string;
	} {
		if (rank === 1)
			return {
				border: 'border-yellow-500',
				bg: 'bg-gradient-to-b from-yellow-500/20 to-yellow-500/5',
				accent: 'text-yellow-400',
				glow: 'shadow-lg shadow-yellow-500/20'
			};
		if (rank === 2)
			return {
				border: 'border-neutral-400',
				bg: 'bg-gradient-to-b from-neutral-400/20 to-neutral-400/5',
				accent: 'text-neutral-300',
				glow: 'shadow-lg shadow-neutral-400/10'
			};
		if (rank === 3)
			return {
				border: 'border-amber-600',
				bg: 'bg-gradient-to-b from-amber-600/20 to-amber-600/5',
				accent: 'text-amber-500',
				glow: 'shadow-lg shadow-amber-600/10'
			};
		return { border: 'border-neutral-800', bg: '', accent: 'text-neutral-400', glow: '' };
	}

	function displayName(player: PublicPlayer): string {
		return player.id === currentPlayerId ? `${player.name} (you)` : player.name;
	}

	onMount(() => {
		// Celebration confetti
		setTimeout(() => {
			fireSuccessConfetti();
			if (currentPlayerWon) {
				setTimeout(() => fireSuccessConfetti(), 500);
				setTimeout(() => fireSuccessConfetti(), 1000);
			}
		}, 300);
	});

	function playAgain() {
		goto('/');
	}
</script>

<div class="min-h-screen bg-black text-white flex flex-col" data-testid="game-over">
	<!-- Header -->
	<div class="text-center pt-8 pb-4">
		<h1 class="text-4xl md:text-6xl font-bold mb-2" data-testid="game-over-title">
			{#if currentPlayerWon}
				<span
					class="bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent"
				>
					You Won!
				</span>
			{:else}
				Game Over
			{/if}
		</h1>
		<p class="text-neutral-500" data-testid="final-results-label">Final Results</p>
	</div>

	<!-- Podium Section -->
	<div class="flex-1 flex flex-col justify-center px-4 pb-8">
		<div class="max-w-5xl mx-auto w-full">
			{#if podiumPlayers.length > 0}
				<div class="flex items-end justify-center gap-4 md:gap-6 mb-8" data-testid="podium">
					<!-- 2nd Place -->
					{#if podiumPlayers[1]}
						{@const style = getRankStyle(2)}
						<div class="flex-1 max-w-[280px] order-1">
							<div class="border-2 {style.border} {style.bg} {style.glow} overflow-hidden">
								<div class="p-4 text-center">
									<div class="text-4xl mb-2">{getMedalEmoji(2)}</div>
									<div class="text-2xl font-bold {style.accent} mb-1">2nd</div>
									<div class="text-lg font-semibold truncate mb-3">
										{displayName(podiumPlayers[1])}
									</div>

									<div class="text-4xl font-mono font-bold text-white mb-4">
										{podiumPlayers[1].score}
										<span class="text-sm text-neutral-500 font-normal">pts</span>
									</div>

									<div class="space-y-1 text-sm text-neutral-400">
										<div class="flex justify-between">
											<span>Model</span>
											<span class="text-neutral-300 truncate ml-2"
												>{getModelName(podiumPlayers[1].model)}</span
											>
										</div>
										<div class="flex justify-between">
											<span>Prompts</span>
											<span class="text-neutral-300">{podiumPlayers[1].promptsUsed}</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- 1st Place (center, larger) -->
					{#if podiumPlayers[0]}
						{@const style = getRankStyle(1)}
						<div class="flex-1 max-w-[320px] order-2 -mb-4">
							<div class="border-2 {style.border} {style.bg} {style.glow} overflow-hidden">
								<div class="p-6 text-center">
									<div class="text-5xl mb-2">{getMedalEmoji(1)}</div>
									<div class="text-3xl font-bold {style.accent} mb-1">1st</div>
									<div class="text-xl font-semibold truncate mb-4">
										{displayName(podiumPlayers[0])}
									</div>

									<div class="text-5xl font-mono font-bold text-white mb-4">
										{podiumPlayers[0].score}
										<span class="text-sm text-neutral-500 font-normal">pts</span>
									</div>

									<div class="space-y-1 text-sm text-neutral-400">
										<div class="flex justify-between">
											<span>Model</span>
											<span class="text-neutral-300 truncate ml-2"
												>{getModelName(podiumPlayers[0].model)}</span
											>
										</div>
										<div class="flex justify-between">
											<span>Prompts</span>
											<span class="text-neutral-300">{podiumPlayers[0].promptsUsed}</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- 3rd Place -->
					{#if podiumPlayers[2]}
						{@const style = getRankStyle(3)}
						<div class="flex-1 max-w-[280px] order-3">
							<div class="border-2 {style.border} {style.bg} {style.glow} overflow-hidden">
								<div class="p-4 text-center">
									<div class="text-4xl mb-2">{getMedalEmoji(3)}</div>
									<div class="text-2xl font-bold {style.accent} mb-1">3rd</div>
									<div class="text-lg font-semibold truncate mb-3">
										{displayName(podiumPlayers[2])}
									</div>

									<div class="text-4xl font-mono font-bold text-white mb-4">
										{podiumPlayers[2].score}
										<span class="text-sm text-neutral-500 font-normal">pts</span>
									</div>

									<div class="space-y-1 text-sm text-neutral-400">
										<div class="flex justify-between">
											<span>Model</span>
											<span class="text-neutral-300 truncate ml-2"
												>{getModelName(podiumPlayers[2].model)}</span
											>
										</div>
										<div class="flex justify-between">
											<span>Prompts</span>
											<span class="text-neutral-300">{podiumPlayers[2].promptsUsed}</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Other Players -->
			{#if otherPlayers.length > 0}
				<div class="border-t border-neutral-800 pt-6">
					<h3 class="text-sm text-neutral-500 mb-4 uppercase tracking-wider text-center">
						Other Players
					</h3>
					<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
						{#each otherPlayers as player, i (player.id)}
							<div
								class="border border-neutral-800 bg-neutral-950/50 p-3 flex items-center justify-between"
							>
								<div class="flex items-center gap-3 min-w-0">
									<span class="text-neutral-500 font-mono">#{i + 4}</span>
									<div class="min-w-0">
										<div class="truncate text-sm">{displayName(player)}</div>
										<div class="text-xs text-neutral-600 truncate">
											{getModelName(player.model)}
										</div>
									</div>
								</div>
								<div class="text-right shrink-0 ml-2">
									<div class="font-mono font-bold">{player.score}</div>
									<div class="text-xs text-neutral-600">{player.promptsUsed} prompts</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Footer -->
	<div class="border-t border-neutral-800 px-4 py-6 bg-neutral-950">
		<div class="max-w-md mx-auto">
			<button
				onclick={playAgain}
				data-testid="play-again-button"
				class="w-full py-4 bg-orange-500 text-black font-bold text-lg hover:bg-orange-400 transition-colors"
			>
				Play Again
			</button>
		</div>
	</div>
</div>
