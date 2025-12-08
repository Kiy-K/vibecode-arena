<script lang="ts">
	import { Tabs } from 'bits-ui';

	type MobileTab = 'challenge' | 'chat' | 'code';

	interface Props {
		activeTab: MobileTab;
		onTabChange: (tab: MobileTab) => void;
		hasCode: boolean;
		submitted: boolean;
	}

	let { activeTab, onTabChange, hasCode, submitted }: Props = $props();

	function handleValueChange(value: string) {
		onTabChange(value as MobileTab);
	}
</script>

<Tabs.Root value={activeTab} onValueChange={handleValueChange} class="md:hidden">
	<Tabs.List class="flex border-b border-neutral-800 bg-neutral-950">
		<Tabs.Trigger
			value="challenge"
			class="flex-1 py-2.5 text-xs font-medium transition-colors data-[state=active]:text-orange-400 data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:bg-orange-500/5 data-[state=inactive]:text-neutral-500 data-[state=inactive]:hover:text-neutral-300"
		>
			Challenge
		</Tabs.Trigger>
		<Tabs.Trigger
			value="chat"
			class="flex-1 py-2.5 text-xs font-medium transition-colors data-[state=active]:text-orange-400 data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:bg-orange-500/5 data-[state=inactive]:text-neutral-500 data-[state=inactive]:hover:text-neutral-300"
		>
			Chat
		</Tabs.Trigger>
		<Tabs.Trigger
			value="code"
			class="flex-1 py-2.5 text-xs font-medium transition-colors relative data-[state=active]:text-orange-400 data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:bg-orange-500/5 data-[state=inactive]:text-neutral-500 data-[state=inactive]:hover:text-neutral-300"
		>
			Code
			{#if hasCode && !submitted}
				<span
					class="absolute top-1 right-1/4 w-2 h-2 bg-orange-500 rounded-full"
					aria-label="New code available"
				></span>
			{/if}
		</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
