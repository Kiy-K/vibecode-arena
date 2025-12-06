<script lang="ts">
  import { goto } from "$app/navigation";

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    if (e.key === "c") goto("/create");
    if (e.key === "j") goto("/join");
  }
</script>

<svelte:head>
  <!-- Speculation Rules API - Prerender likely destinations -->
  {@html `<script type="speculationrules">
    {
      "prerender": [
        { "where": { "href_matches": ["/create", "/join"] } }
      ],
      "prefetch": [
        { "where": { "href_matches": ["/create", "/join"] } }
      ]
    }
  </script>`}
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen bg-black text-white flex items-center justify-center p-4 md:p-8">
  <div class="w-full max-w-4xl border border-neutral-800 flex flex-col md:flex-row min-h-[500px]" style="view-transition-name: main-card;">
    <!-- Left: Main content -->
    <div class="flex-1 flex flex-col items-center justify-center p-8" style="view-transition-name: main-content;">
      <!-- Header -->
      <div class="text-center mb-12">
        <h1 class="text-4xl md:text-5xl font-bold mb-3">
          <span class="text-orange-500">vibe</span>code arena
        </h1>
        <p class="text-neutral-500 text-sm">
          competitive ai-assisted coding battles
        </p>
      </div>

      <!-- Action buttons -->
      <div class="w-full max-w-sm space-y-4">
        <a
          href="/create"
          class="block w-full py-4 px-6 bg-orange-500 text-black font-bold text-lg hover:bg-orange-400 transition-colors text-center"
        >
          create room <span class="text-black/50 text-sm ml-2">[C]</span>
        </a>
        <a
          href="/join"
          class="block w-full py-4 px-6 border border-neutral-700 text-white font-bold text-lg hover:border-neutral-500 transition-colors text-center"
        >
          join room <span class="text-neutral-500 text-sm ml-2">[J]</span>
        </a>
      </div>

      <!-- Footer -->
      <div class="mt-12 text-center">
        <p class="text-neutral-600 text-xs">
          powered by
          <a
            href="https://e2b.dev"
            target="_blank"
            class="text-orange-500 hover:text-orange-400">e2b</a
          >
          ·
          <a
            href="https://openrouter.ai"
            target="_blank"
            class="text-orange-500 hover:text-orange-400">openrouter</a
          >
          ·
          <a
            href="https://sdk.vercel.ai"
            target="_blank"
            class="text-orange-500 hover:text-orange-400">ai sdk</a
          >
        </p>
        <p class="text-neutral-700 hover:text-neutral-500 text-xs mt-2">
          vibecoded by
          <a
            href="https://linkedin.com/in/brebera/"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:underline">@bxxf</a
          >
        </p>
      </div>
    </div>

    <!-- Right: Info panel -->
    <div class="hidden md:flex w-72 bg-neutral-950/50 border-l border-neutral-800 flex-col" style="view-transition-name: side-panel;">
      <div class="p-4 border-b border-neutral-800">
        <div class="text-neutral-600 text-[10px] uppercase tracking-widest">
          what is this?
        </div>
      </div>
      <div class="flex-1 p-4 font-mono text-xs space-y-6">
        <div class="space-y-3">
          <p class="text-neutral-400 leading-relaxed">
            a multiplayer game where you compete to build UI components using AI.
          </p>
          <p class="text-neutral-500 leading-relaxed">
            you get a reference design. prompt your AI to recreate it. fastest accurate solution wins.
          </p>
        </div>

        <div class="pt-4 border-t border-neutral-800 space-y-3">
          <div class="text-neutral-600 text-[10px] uppercase tracking-widest mb-3">
            features
          </div>
          <div class="flex items-start gap-2">
            <span class="text-orange-500">›</span>
            <span class="text-neutral-400">real-time sandbox preview</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="text-orange-500">›</span>
            <span class="text-neutral-400">multiple AI models to choose from</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="text-orange-500">›</span>
            <span class="text-neutral-400">AI-powered similarity scoring</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="text-orange-500">›</span>
            <span class="text-neutral-400">model handicap system</span>
          </div>
        </div>

        <div class="pt-4 border-t border-neutral-800">
          <div class="text-neutral-600 text-[10px] uppercase tracking-widest mb-3">
            scoring
          </div>
          <div class="space-y-2 text-neutral-500">
            <div>time bonus · prompts used</div>
            <div>similarity score · model multiplier</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
