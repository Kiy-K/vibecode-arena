<script lang="ts">
  import MessageContent from "$lib/components/MessageContent.svelte";
  import type { ToolCall } from "$lib/hooks/useChat.svelte";

  type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCalls?: ToolCall[];
  };

  interface Props {
    messages: ChatMessage[];
    chatLoading: boolean;
    chatInput: string;
    submitted: boolean;
    modelId: string | undefined;
    codeSourceMessageId: string | null;
    onSend: (e: Event) => void;
    onInputChange: (value: string) => void;
    onUseCode: (messageId: string, code: string) => void;
    extractCode: (content: string) => string | null;
    textareaRef?: (el: HTMLTextAreaElement) => void;
  }

  let {
    messages,
    chatLoading,
    chatInput,
    submitted,
    modelId,
    codeSourceMessageId,
    onSend,
    onInputChange,
    onUseCode,
    extractCode,
    textareaRef,
  }: Props = $props();

  let textareaEl: HTMLTextAreaElement;
  let messagesContainer: HTMLDivElement;

  $effect(() => {
    if (textareaEl && textareaRef) {
      textareaRef(textareaEl);
    }
  });

  // Auto-scroll when messages change
  $effect(() => {
    if (messages.length > 0 && messagesContainer) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 50);
    }
  });

  function autoResize() {
    if (textareaEl) {
      textareaEl.style.height = "auto";
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + "px";
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend(e);
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onInputChange(target.value);
    autoResize();
  }
</script>

<div class="flex-1 flex flex-col">
  <!-- Messages -->
  <div
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto px-4 md:px-8 py-4 scrollbar-auto"
  >
    {#if messages.length === 0 && !chatLoading}
      <div class="h-full flex items-center justify-center">
        <div class="text-center max-w-md">
          <div class="text-6xl mb-4 opacity-20">⚡</div>
          <p class="text-xl text-neutral-500 mb-2">prompt your ai</p>
          <p class="text-neutral-700 text-sm">describe what you need</p>
        </div>
      </div>
    {:else}
      <div class="space-y-4 max-w-3xl mx-auto">
        {#each messages as message (message.id)}
          <div
            class="flex {message.role === 'user'
              ? 'justify-end'
              : 'justify-start'}"
          >
            <div
              class="max-w-2xl {message.role === 'user'
                ? 'bg-orange-500/5 border-orange-500/20'
                : 'bg-neutral-900/50 border-neutral-800/50'} border p-4"
            >
              <div
                class="text-xs text-neutral-600 mb-2 uppercase tracking-wider"
              >
                {message.role === "user" ? "you" : modelId}
              </div>
              {#if message.toolCalls && message.toolCalls.length > 0}
                <div class="mb-3 space-y-2">
                  {#each message.toolCalls as toolCall}
                    <div class="flex items-center gap-2 text-xs bg-orange-500/10 border border-orange-500/20 px-3 py-2">
                      <svg class="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                      <span class="text-orange-400 font-medium">{toolCall.toolName}</span>
                      {#if toolCall.toolName === 'get_hint' && toolCall.result}
                        {@const result = toolCall.result as { success: boolean; hintsRemaining: number; pointsCost: number }}
                        <span class="text-neutral-500">
                          {result.success ? `-${result.pointsCost} pts` : 'no hints left'}
                          <span class="text-neutral-600">({result.hintsRemaining} remaining)</span>
                        </span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
              <div class="text-sm leading-relaxed text-neutral-300">
                <MessageContent content={message.content} />
              </div>
              {#if message.role === "assistant"}
                {@const extracted = extractCode(message.content)}
                {@const isLastMessage = messages.indexOf(message) === messages.length - 1}
                {@const isStreaming = isLastMessage && chatLoading}
                {#if extracted && !isStreaming}
                  {#if codeSourceMessageId === message.id}
                    <!-- Currently in use -->
                  {:else}
                    <button
                      onclick={() => onUseCode(message.id, extracted)}
                      class="mt-3 text-xs text-neutral-500 hover:text-orange-400 transition-colors"
                    >
                      use this version instead
                    </button>
                  {/if}
                {/if}
              {/if}
            </div>
          </div>
        {/each}
        {#if chatLoading && (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant" || !messages[messages.length - 1]?.content)}
          <div class="flex justify-start">
            <div class="bg-neutral-900/50 border border-neutral-800/50 p-4">
              <div
                class="text-xs text-neutral-600 mb-2 uppercase tracking-wider"
              >
                {modelId}
              </div>
              <div class="flex items-center gap-2">
                <div
                  class="w-2 h-2 bg-orange-500 rounded-full animate-pulse"
                ></div>
                <span class="text-neutral-500">generating...</span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Chat Input -->
  <div
    class="p-3 md:p-6 bg-gradient-to-t from-neutral-950 via-neutral-950/80 to-transparent"
  >
    <form onsubmit={onSend} class="max-w-3xl mx-auto">
      <div class="relative group">
        <!-- Glow effect -->
        <div
          class="absolute -inset-1 bg-gradient-to-r from-orange-500/20 via-orange-400/10 to-orange-500/20 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"
        ></div>

        <div
          class="relative flex items-center gap-3 bg-black border {submitted
            ? 'border-neutral-800'
            : 'border-neutral-700 focus-within:border-orange-500/50'} transition-colors px-3 py-2"
        >
          <textarea
            bind:this={textareaEl}
            value={chatInput}
            oninput={handleInput}
            onkeydown={handleKeydown}
            placeholder={submitted
              ? "solution submitted"
              : "tell your ai what to do..."}
            disabled={submitted}
            rows="3"
            class="flex-1 py-2 bg-transparent text-base text-white placeholder-neutral-600 focus:outline-none disabled:opacity-30 resize-none leading-relaxed"
            style="max-height: 200px;"
          ></textarea>
          <button
            type="submit"
            disabled={chatLoading || submitted || !chatInput.trim()}
            class="shrink-0 p-2.5 bg-orange-500 text-black hover:bg-orange-400 transition-all disabled:opacity-30 disabled:bg-neutral-800 disabled:text-neutral-600 self-end mb-1"
          >
            {#if chatLoading}
              <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  class="opacity-25"
                />
                <path
                  d="M12 2a10 10 0 0 1 10 10"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </svg>
            {:else}
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </form>
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
</style>
