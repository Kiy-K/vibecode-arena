<!--
	RoundReview - Between-rounds review screen.
	Shows all player submissions with previews and rankings.
-->
<script lang="ts">
	import type { Player, PublicPlayer, Challenge, PublicChallenge } from '$lib/types/game';

	let {
		players,
		challenge,
		round,
		maxRounds,
		countdown,
		readyCount = 0,
		isReady = false,
		markingReady = false,
		isLastRound = false,
		currentPlayerId,
		onContinue
	}: {
		players: (Player | PublicPlayer)[];
		challenge: Challenge | PublicChallenge;
		round: number;
		maxRounds: number;
		countdown: number;
		readyCount?: number;
		isReady?: boolean;
		markingReady?: boolean;
		isLastRound?: boolean;
		currentPlayerId?: string;
		onContinue?: () => void;
	} = $props();

	// Sort players by round score (highest first)
	const sortedPlayers = $derived(
		[...players].sort((a, b) => {
			const scoreA = a.roundScore ?? 0;
			const scoreB = b.roundScore ?? 0;
			return scoreB - scoreA;
		})
	);

	// Get rank for display
	function getRank(index: number): string {
		const rank = index + 1;
		if (rank === 1) return '1st';
		if (rank === 2) return '2nd';
		if (rank === 3) return '3rd';
		return `${rank}th`;
	}

	function getRankColor(index: number): string {
		if (index === 0) return 'text-yellow-400';
		if (index === 1) return 'text-neutral-300';
		if (index === 2) return 'text-amber-500';
		return 'text-neutral-500';
	}

	function displayName(player: Player | PublicPlayer): string {
		return player.id === currentPlayerId ? `${player.name} (you)` : player.name;
	}

	/** Check if player has submitted (works with both Player and PublicPlayer) */
	function hasPlayerSubmitted(player: Player | PublicPlayer): boolean {
		if ('hasSubmitted' in player) return player.hasSubmitted;
		return (player as Player).submissionTime !== undefined && (player as Player).submissionTime !== -1;
	}
</script>

<div class="min-h-screen bg-black text-white flex flex-col">
	<!-- Header -->
	<div class="border-b border-neutral-800 px-4 py-3">
		<div class="max-w-6xl mx-auto flex items-center justify-between">
			<div>
				<h2 class="text-lg font-bold">Round {round} Complete</h2>
				<p class="text-sm text-neutral-500">{challenge.title}</p>
			</div>
			<div class="text-right">
				<p class="text-neutral-400 text-sm">
					{readyCount}/{players.length} ready
				</p>
				<p class="text-2xl font-mono font-bold text-orange-500">{countdown}s</p>
				{#if isLastRound}
					<p class="text-xs text-neutral-500">to final leaderboard</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Content - Adaptive Grid based on player count -->
	<div class="flex-1 overflow-auto p-4 flex items-center">
		<div class="max-w-6xl mx-auto w-full">
			<div class="grid gap-4 {
				sortedPlayers.length === 1 ? 'grid-cols-1 max-w-xl mx-auto' :
				sortedPlayers.length === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto' :
				sortedPlayers.length <= 4 ? 'grid-cols-1 sm:grid-cols-2 max-w-4xl mx-auto' :
				'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
			}">
				{#each sortedPlayers as player, i (player.id)}
					{@const isCurrentPlayer = player.id === currentPlayerId}
					<div class="border {isCurrentPlayer ? 'border-orange-500/50' : 'border-neutral-800'} overflow-hidden bg-neutral-950/50">
						<!-- Preview -->
						<div class="aspect-video bg-neutral-900 relative">
							{#if player.sandboxUrl}
								<iframe
									src={player.sandboxUrl}
									title="{player.name}'s submission"
									class="w-full h-full border-0"
								></iframe>
							{:else}
								<div class="absolute inset-0 flex items-center justify-center text-neutral-600 text-sm">
									No submission
								</div>
							{/if}
						</div>

						<!-- Info -->
						<div class="p-3 bg-neutral-900/50">
							<div class="flex items-center justify-between mb-1">
								<div class="flex items-center gap-2 min-w-0">
									<span class="text-sm font-medium {getRankColor(i)}">{getRank(i)}</span>
									<span class="text-sm truncate {isCurrentPlayer ? 'text-orange-400' : 'text-white'}">
										{displayName(player)}
									</span>
								</div>
								<span class="text-orange-500 font-mono font-bold shrink-0">
									+{player.roundScore ?? 0}
								</span>
							</div>
							{#if player.passed === false && hasPlayerSubmitted(player)}
								<p class="text-xs text-red-400">Did not pass</p>
							{:else if !hasPlayerSubmitted(player)}
								<p class="text-xs text-neutral-500">No submission</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Footer with Continue Button -->
	<div class="border-t border-neutral-800 px-4 py-3 bg-neutral-950">
		<div class="max-w-6xl mx-auto flex justify-between items-center">
			<div class="flex gap-1">
				{#each {length: maxRounds} as _, i (i)}
					<div class="w-8 h-1 {i < round ? 'bg-orange-500' : 'bg-neutral-800'}"></div>
				{/each}
			</div>

			<button
				onclick={onContinue}
				disabled={isReady || markingReady}
				class="px-6 py-2 bg-orange-500 text-black font-bold hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
			>
				{#if markingReady}
					<span class="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
				{/if}
				{#if isReady}
					Waiting for others...
				{:else if markingReady}
					Loading...
				{:else if isLastRound}
					See Results
				{:else}
					Continue
				{/if}
			</button>

			<span class="text-sm text-neutral-500">Round {round}/{maxRounds}</span>
		</div>
	</div>
</div>
