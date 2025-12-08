<!--
  Lobby - Pre-game waiting room.
  Shows room code, player list, and start button for host.
-->
<script lang="ts">
	import { MODELS } from '$lib/config/models';
	import type { PublicRoom } from '$lib/types/game';

	interface Props {
		room: PublicRoom;
		playerId: string;
		isHost: boolean;
		sandboxReady: boolean;
		sandboxLogs?: string[];
		onStartGame: () => Promise<void>;
	}

	let { room, playerId, isHost, sandboxReady, sandboxLogs = [], onStartGame }: Props = $props();

	let copied = $state(false);
	let starting = $state(false);

	function copyCode() {
		navigator.clipboard.writeText(room.code);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function handleStart() {
		starting = true;
		try {
			await onStartGame();
		} finally {
			starting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && isHost && sandboxReady && !starting) {
			handleStart();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen flex items-center justify-center p-4 md:p-8">
	<div class="w-full max-w-4xl border border-neutral-800 flex flex-col md:flex-row min-h-[500px]">
		<!-- Left: Main content -->
		<div class="flex-1 flex flex-col items-center justify-center p-8">
			<!-- Room code -->
			<button
				onclick={copyCode}
				aria-label="Copy room code {room.code} to clipboard"
				class="mb-12 text-center group cursor-pointer"
			>
				<div class="text-neutral-600 text-xs uppercase tracking-widest mb-3">
					room code {copied ? '· copied!' : ''}
				</div>
				<div
					class="text-5xl md:text-6xl font-mono font-bold tracking-[0.4em] text-white group-hover:text-orange-500 transition-colors"
				>
					{room.code}
				</div>
				<div class="text-neutral-700 text-xs mt-3 group-hover:text-neutral-500 transition-colors">
					click to copy
				</div>
			</button>

			<!-- Players list -->
			<div class="w-full max-w-sm mb-10" data-testid="player-list">
				<div
					class="text-neutral-600 text-xs uppercase tracking-widest mb-3"
					data-testid="player-count"
				>
					players ({room.players.length})
				</div>
				<div class="space-y-2">
					{#each room.players as p (p.id)}
						<div class="flex items-center justify-between py-2">
							<div class="flex items-center gap-3">
								<span class="font-medium">{p.name}</span>
								{#if p.id === room.hostId}
									<span class="text-[10px] text-orange-500 uppercase" data-testid="host-badge"
										>host</span
									>
								{/if}
								{#if p.id === playerId}
									<span class="text-[10px] text-neutral-600">you</span>
								{/if}
							</div>
							<span class="text-xs text-neutral-500">
								{MODELS.find((m) => m.id === p.model)?.name}
							</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Start button / status -->
			{#if isHost}
				<button
					onclick={handleStart}
					disabled={starting || !sandboxReady}
					data-testid="start-game-button"
					class="px-10 py-4 bg-orange-500 text-black font-bold text-lg hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if starting}
						starting...
					{:else if !sandboxReady}
						preparing...
					{:else}
						start game
					{/if}
				</button>
				<div
					class="text-xs mt-3 h-4 {sandboxReady && !starting
						? 'text-neutral-600'
						: 'text-transparent'}"
				>
					press Enter
				</div>
			{:else}
				<div class="text-neutral-500" data-testid="waiting-status">
					{#if !sandboxReady}
						preparing sandbox...
					{:else}
						waiting for host...
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right: Console (always visible) -->
		<div class="hidden md:flex w-72 bg-neutral-950/50 border-l border-neutral-800 flex-col">
			<div class="p-4 border-b border-neutral-800">
				<div class="text-neutral-600 text-[10px] uppercase tracking-widest">console</div>
			</div>
			<div class="flex-1 p-4 font-mono text-xs overflow-y-auto">
				{#if sandboxLogs.length > 0}
					<div class="space-y-1">
						{#each sandboxLogs as log, i (i)}
							<div class="text-neutral-400">{log}</div>
						{/each}
						{#if starting || !sandboxReady}
							<div class="text-neutral-600 animate-pulse">_</div>
						{/if}
					</div>
				{:else}
					<div class="text-neutral-700">waiting...</div>
				{/if}
			</div>
		</div>
	</div>
</div>
