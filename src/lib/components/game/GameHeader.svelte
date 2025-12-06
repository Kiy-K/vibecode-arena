<!--
  GameHeader - Top bar during gameplay.
  Shows challenge info, timer, score, and player status.
-->
<script lang="ts">
  import { Tooltip } from "bits-ui";
  import { MODELS } from "$lib/config/models";
  import type { Room, Player } from "$lib/types/game";

  interface Props {
    room: Room;
    player: Player | undefined;
    timeLeft: number;
    submissions: { playerId: string }[];
    promptsUsed: number;
    sandboxReady: boolean;
    submitting?: boolean;
    formatTime: (seconds: number) => string;
  }

  let {
    room,
    player,
    timeLeft,
    submissions,
    promptsUsed,
    submitting = false,
    formatTime,
  }: Props = $props();

  const challenge = $derived(room.currentChallenge);

  // Calculate percentage of time remaining (0-100)
  const timePercent = $derived(
    challenge ? (timeLeft / challenge.timeLimit) * 100 : 100
  );

  // Color thresholds based on percentage
  const isUrgent = $derived(timePercent <= 20); // Last 20%
  const isWarning = $derived(timePercent <= 40); // Last 40%

  // Timer is frozen when submitting (being judged)
  const isFrozen = $derived(submitting);
</script>

<header
  class="relative border-b border-neutral-800 bg-gradient-to-r from-black via-neutral-950 to-black"
>
  <!-- Timer bar (z-50 to stay above timer display) -->
  <div class="absolute bottom-0 left-0 right-0 h-px z-50">
    <div
      class="h-full transition-all duration-1000 ease-linear {isUrgent
        ? 'bg-red-500'
        : isWarning
          ? 'bg-orange-400'
          : 'bg-orange-500'}"
      style="width: {timePercent}%"
    ></div>
  </div>

  <div
    class="flex items-center justify-between px-3 md:px-6 py-2 md:py-3 gap-2"
  >
    <!-- Left: Round + Passed + Timer (mobile) -->
    <div class="flex items-center gap-2 md:gap-3">
      <span class="text-xs md:text-sm font-mono text-orange-500">
        ROUND {room.round}/{room.maxRounds}
      </span>

      <!-- Finished players -->
      <div
        class="flex items-center gap-1 md:gap-2 px-1.5 md:px-2.5 py-1 {submissions.length >
        0
          ? 'bg-green-500/10 border border-green-500/20'
          : 'bg-neutral-900 border border-neutral-800'}"
      >
        <div
          class="w-1.5 h-1.5 rounded-full {submissions.length > 0
            ? 'bg-green-500'
            : 'bg-neutral-700'}"
        ></div>
        <span
          class="text-xs font-mono {submissions.length > 0
            ? 'text-green-400'
            : 'text-neutral-600'}"
        >
          {submissions.length}/{room.players.length}
          <span class="text-neutral-500 hidden sm:inline">passed</span>
        </span>
      </div>

      <!-- Timer inline on mobile -->
      <div class="md:hidden relative">
        {#if isFrozen}
          <div class="absolute -inset-1 bg-cyan-500/20 blur-lg"></div>
        {:else if isUrgent}
          <div class="absolute -inset-1 bg-red-500/20 blur-lg animate-pulse"></div>
        {/if}
        <div
          class="relative px-3 py-1 bg-black border {isFrozen
            ? 'border-cyan-500'
            : isUrgent
              ? 'border-red-500'
              : 'border-neutral-800'} font-mono"
        >
          <span
            class="text-base font-bold tabular-nums {isFrozen
              ? 'text-cyan-400'
              : isUrgent
                ? 'text-red-500 animate-pulse'
                : isWarning
                  ? 'text-orange-400'
                  : 'text-white'}"
          >
            {formatTime(timeLeft)}
          </span>
        </div>
      </div>
    </div>

    <!-- Center: Timer (desktop only) -->
    <div
      class="hidden md:flex absolute left-1/2 -translate-x-1/2 bottom-0 items-end"
    >
      <div class="relative">
        {#if isFrozen}
          <div class="absolute -inset-2 bg-cyan-500/20 blur-xl"></div>
        {:else if isUrgent}
          <div class="absolute -inset-2 bg-red-500/20 blur-xl animate-pulse"></div>
        {/if}
        <div
          class="relative px-6 py-2 bg-black border-t border-l border-r {isFrozen
            ? 'border-cyan-500'
            : isUrgent
              ? 'border-red-500'
              : 'border-neutral-800'} font-mono"
        >
          <div class="flex items-baseline gap-1">
            <span
              class="text-3xl font-bold tabular-nums {isFrozen
                ? 'text-cyan-400'
                : isUrgent
                  ? 'text-red-500 animate-pulse'
                  : isWarning
                    ? 'text-orange-400'
                    : 'text-white'}"
            >
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Stats -->
    <div class="flex items-center gap-1 md:gap-2">
      <!-- Player score -->
      <Tooltip.Root delayDuration={200}>
        <Tooltip.Trigger>
          <div
            class="flex items-center gap-2 px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 cursor-help"
          >
            <span class="text-xs text-orange-400">score</span>
            <span class="text-xs font-mono font-bold text-orange-500">
              {player?.score ?? 0}
            </span>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content
          class="z-50 px-3 py-2 text-xs bg-neutral-900 border border-neutral-700 text-neutral-300 max-w-48"
          sideOffset={8}
        >
          Your total points. Earn more by solving fast with fewer prompts.
        </Tooltip.Content>
      </Tooltip.Root>

      <!-- Prompts used -->
      <Tooltip.Root delayDuration={200}>
        <Tooltip.Trigger>
          <div
            class="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-neutral-900 border border-neutral-800 cursor-help"
          >
            <span class="text-xs text-neutral-500">prompts</span>
            <span
              class="text-xs font-mono font-bold {promptsUsed === 0
                ? 'text-neutral-600'
                : promptsUsed < 3
                  ? 'text-green-400'
                  : promptsUsed < 5
                    ? 'text-orange-400'
                    : 'text-red-400'}"
            >
              {promptsUsed}
            </span>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content
          class="z-50 px-3 py-2 text-xs bg-neutral-900 border border-neutral-700 text-neutral-300 max-w-48"
          sideOffset={8}
        >
          Messages sent this round. Fewer prompts = higher score bonus.
        </Tooltip.Content>
      </Tooltip.Root>

      <!-- Model badge -->
      <Tooltip.Root delayDuration={200}>
        <Tooltip.Trigger>
          <div
            class="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-neutral-900 border border-neutral-800 cursor-help"
          >
            <span class="text-xs text-neutral-400">
              {MODELS.find((m) => m.id === player?.model)?.name}
            </span>
            <span class="text-xs font-mono text-neutral-500">
              {MODELS.find((m) => m.id === player?.model)?.multiplier}×
            </span>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content
          class="z-50 px-3 py-2 text-xs bg-neutral-900 border border-neutral-700 text-neutral-300 max-w-52"
          sideOffset={8}
        >
          Your AI model. Lower multiplier = smarter model = less points (for balance).
        </Tooltip.Content>
      </Tooltip.Root>
    </div>
  </div>
</header>
