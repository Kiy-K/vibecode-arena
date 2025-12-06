<script lang="ts">
  import { MODELS } from "$lib/config/models";
  import type { Player } from "$lib/types/game";

  type PlayerStatus = 'working' | 'analysing' | 'passed' | 'failed';

  interface Props {
    players: Player[];
    currentPlayerId: string;
    judgingPlayerIds?: Set<string>;
  }

  let { players, currentPlayerId, judgingPlayerIds = new Set() }: Props = $props();

  function getPlayerStatus(player: Player): PlayerStatus {
    // Being judged (submitted but waiting for AI analysis)
    if (judgingPlayerIds.has(player.id)) {
      return 'analysing';
    }
    // Submitted and passed
    if (player.passed === true) {
      return 'passed';
    }
    // Submitted but failed (has submissionTime but didn't pass)
    if (player.submissionTime !== undefined && player.passed === false) {
      return 'failed';
    }
    // Still working
    return 'working';
  }

  const statusConfig = {
    working: {
      label: 'coding',
      color: 'text-neutral-400',
      bg: 'bg-neutral-800',
      dot: 'bg-neutral-500'
    },
    analysing: {
      label: 'analysing',
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      dot: 'bg-cyan-500 animate-pulse'
    },
    passed: {
      label: 'passed',
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      dot: 'bg-green-500'
    },
    failed: {
      label: 'failed',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      dot: 'bg-red-500'
    }
  };

  // Sort players: current player first, then by name
  const sortedPlayers = $derived(
    [...players].sort((a, b) => {
      if (a.id === currentPlayerId) return -1;
      if (b.id === currentPlayerId) return 1;
      return a.name.localeCompare(b.name);
    })
  );
</script>

<div class="space-y-1">
  <div class="text-xs text-neutral-500 uppercase tracking-wider mb-2 px-2">
    Players
  </div>
  {#each sortedPlayers as player (player.id)}
    {@const status = getPlayerStatus(player)}
    {@const config = statusConfig[status]}
    {@const isCurrentPlayer = player.id === currentPlayerId}
    <div
      class="flex items-center gap-2 px-2 py-1.5 rounded {isCurrentPlayer ? 'bg-neutral-800/50' : ''}"
    >
      <!-- Status dot -->
      <div class="w-2 h-2 rounded-full shrink-0 {config.dot}"></div>

      <!-- Player info -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1">
          <span
            class="text-sm truncate {isCurrentPlayer ? 'text-white font-medium' : 'text-neutral-300'}"
          >
            {player.name}
          </span>
          {#if isCurrentPlayer}
            <span class="text-xs text-neutral-500">(you)</span>
          {/if}
        </div>
        <div class="text-xs">
          <span class={config.color}>{config.label}</span>
        </div>
      </div>

      <!-- Model badge (small) -->
      <div class="text-xs text-neutral-600 shrink-0">
        {MODELS.find((m) => m.id === player.model)?.name?.split(' ')[0] ?? ''}
      </div>
    </div>
  {/each}
</div>
