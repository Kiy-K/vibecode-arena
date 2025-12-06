<!--
  CodePanel - Code preview and submission panel.
  Shows live preview, generated code, logs, and submission UI.
-->
<script lang="ts">
  import type { SubmissionResult } from "$lib/types/game";
  import { Highlight } from "svelte-highlight";
  import { xml } from "svelte-highlight/languages";
  import "highlight.js/styles/github-dark.css";

  interface Props {
    code: string;
    result: SubmissionResult | null;
    submitting: boolean;
    submitted: boolean;
    hasCodeSource: boolean;
    sandboxUrl: string | null;
    sandboxLogs: string[];
    isMobile?: boolean;
    onSubmit: () => Promise<void>;
  }

  let {
    code,
    result,
    submitting,
    submitted,
    hasCodeSource,
    sandboxUrl,
    sandboxLogs,
    isMobile = false,
    onSubmit,
  }: Props = $props();
</script>

<div
  class="code-panel {isMobile
    ? 'md:hidden flex-1'
    : 'hidden lg:flex w-[420px] border-l border-neutral-800'} flex flex-col bg-neutral-950"
>
  <!-- Preview -->
  <div class="flex-1 min-h-[150px] flex flex-col border-b border-neutral-800">
    <div class="px-3 py-1.5 border-b border-neutral-800 bg-black">
      <span class="text-xs uppercase tracking-wider text-neutral-500"
        >Preview</span
      >
    </div>
    {#if sandboxUrl}
      <div class="flex-1 bg-neutral-900">
        <iframe
          src={sandboxUrl}
          title="Component Preview"
          class="w-full h-full border-0"
        ></iframe>
      </div>
    {:else}
      <div
        class="flex-1 flex items-center justify-center text-neutral-600 text-sm bg-neutral-900/50"
      >
        Preview will appear here
      </div>
    {/if}
  </div>

  <!-- Code -->
  <div class="flex-1 min-h-[120px] flex flex-col">
    <div class="px-3 py-1.5 border-b border-neutral-800 bg-black">
      <span class="text-xs uppercase tracking-wider text-neutral-500">Code</span
      >
    </div>
    <div class="flex-1 overflow-auto bg-[#0a0a0a] scrollbar-auto code-panel">
      {#if code}
        <Highlight language={xml} {code} />
      {:else}
        <div
          class="h-full flex items-center justify-center text-neutral-600 text-sm"
        >
          Prompt the AI to generate code
        </div>
      {/if}
    </div>
  </div>

  <!-- Sandbox Logs -->
  {#if sandboxLogs.length > 0}
    <div
      class="flex-shrink-0 min-h-[200px] max-h-[400px] overflow-y-auto border-t border-neutral-800 bg-neutral-900"
    >
      <div
        class="px-3 py-1.5 bg-neutral-800 text-xs text-neutral-400 sticky top-0 flex items-center justify-between"
      >
        <span>{submitting ? "🔄 Running..." : "📋 Logs"}</span>
        <span class="text-neutral-600">{sandboxLogs.length} lines</span>
      </div>
      <div class="p-2 font-mono text-[10px] leading-tight">
        {#each sandboxLogs as log, i (i)}
          <p
            class="py-0.5 {log.includes('ERROR')
              ? 'text-red-400'
              : log.includes('✓') || log.includes('PASSED')
                ? 'text-green-400'
                : 'text-neutral-500'}"
          >
            {log}
          </p>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Results -->
  {#if result}
    <div
      class="flex-shrink-0 px-4 py-3 border-t border-neutral-800 bg-black select-none max-h-[300px] overflow-y-auto"
    >
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <div
            class="w-2 h-2 rounded-full {result.passed
              ? 'bg-green-500'
              : 'bg-red-500'}"
          ></div>
          <span
            class="text-sm font-bold {result.passed
              ? 'text-green-400'
              : 'text-red-400'}"
          >
            {result.passed ? "Passed!" : "Not quite"}
          </span>
        </div>
        <div class="text-sm">
          <span class="text-orange-400 font-mono font-bold">{result.score}</span
          >
          <span class="text-neutral-600">/{result.maxScore} pts</span>
        </div>
      </div>

      <!-- Feedback from AI evaluation -->
      {#if result.feedback}
        <p class="text-sm text-neutral-400 leading-relaxed">
          {result.feedback}
        </p>
      {/if}

      {#if result.error}
        <div
          class="text-xs text-red-400 font-mono mt-3 p-2 bg-red-500/10 border border-red-500/20 break-words whitespace-pre-wrap"
        >
          {result.error}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Submit Button -->
  <div class="flex-shrink-0 p-4 border-t border-neutral-800 bg-black">
    <button
      onclick={onSubmit}
      disabled={submitting || submitted || !hasCodeSource}
      class="w-full {isMobile
        ? 'py-3 text-sm'
        : 'py-4 text-base'} font-bold transition-all {submitted
        ? (result?.passed
            ? 'bg-green-600 text-white'
            : 'bg-neutral-700 text-neutral-300') + ' cursor-not-allowed'
        : !hasCodeSource
          ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
          : 'bg-orange-500 text-black hover:bg-orange-400 hover:scale-[1.02] active:scale-[0.98]'}"
    >
      {#if submitting}
        <span class="inline-flex items-center gap-2">
          <span
            class="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"
          ></span>
          {isMobile ? "Evaluating..." : "Evaluating with AI..."}
        </span>
      {:else if submitted}
        ✓ Submitted
      {:else if !hasCodeSource}
        {isMobile ? "Prompt AI first" : "Prompt the AI first"}
      {:else}
        {isMobile ? "Submit →" : "Submit Solution →"}
      {/if}
    </button>
    {#if !submitted && hasCodeSource && !isMobile}
      <p class="text-center text-xs text-neutral-600 mt-2 hidden md:block">
        ⌘↵ to submit
      </p>
    {/if}
  </div>
</div>

<style>
  .scrollbar-auto {
    scrollbar-width: thin;
    scrollbar-color: #404040 transparent;
  }
  .scrollbar-auto::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .scrollbar-auto::-webkit-scrollbar-track {
    background: transparent;
  }
  .scrollbar-auto::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
  }
  .scrollbar-auto:hover::-webkit-scrollbar-thumb {
    background: #404040;
  }
  .code-panel :global(pre) {
    margin: 0;
    padding: 0.75rem;
    font-size: 0.75rem;
    line-height: 1.5;
    background: transparent !important;
  }
  .code-panel :global(code) {
    font-family: "JetBrains Mono", monospace;
    background: transparent !important;
  }
  .code-panel :global(.hljs) {
    background: transparent !important;
  }
</style>
