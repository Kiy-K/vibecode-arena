<script lang="ts">
	type MobileTab = "challenge" | "chat" | "code";

	interface Props {
		activeTab: MobileTab;
		onTabChange: (tab: MobileTab) => void;
		hasCode: boolean;
		submitted: boolean;
	}

	let { activeTab, onTabChange, hasCode, submitted }: Props = $props();
</script>

<div class="md:hidden flex border-b border-neutral-800 bg-neutral-950">
	<button
		onclick={() => onTabChange("challenge")}
		class="flex-1 py-2.5 text-xs font-medium transition-colors {activeTab === 'challenge'
			? 'text-orange-400 border-b-2 border-orange-500 bg-orange-500/5'
			: 'text-neutral-500 hover:text-neutral-300'}"
	>
		Challenge
	</button>
	<button
		onclick={() => onTabChange("chat")}
		class="flex-1 py-2.5 text-xs font-medium transition-colors {activeTab === 'chat'
			? 'text-orange-400 border-b-2 border-orange-500 bg-orange-500/5'
			: 'text-neutral-500 hover:text-neutral-300'}"
	>
		Chat
	</button>
	<button
		onclick={() => onTabChange("code")}
		class="flex-1 py-2.5 text-xs font-medium transition-colors relative {activeTab === 'code'
			? 'text-orange-400 border-b-2 border-orange-500 bg-orange-500/5'
			: 'text-neutral-500 hover:text-neutral-300'}"
	>
		Code
		{#if hasCode && !submitted}
			<span class="absolute top-1 right-1/4 w-2 h-2 bg-orange-500 rounded-full"></span>
		{/if}
	</button>
</div>
