<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { MODELS, DEFAULT_MODEL } from '$lib/config/models';
	import { usePlayerName } from '$lib/hooks/usePlayerName.svelte';
	import { getPageMeta } from '$lib/config/seo';

	let formEl: HTMLFormElement; // Reference to the form element

	let { form } = $props();

	let loading = $state(false);
	const player = usePlayerName();

	const meta = getPageMeta({
		title: 'create room',
		description:
			'create a new vibecode arena room and invite friends to compete in ai-assisted coding challenges.'
	});

	const handleKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') goto('/');
		if (e.key === 'Enter' && !loading) {
			e.preventDefault();
			formEl?.requestSubmit();
		}
	}
</script>

<svelte:window onkeydowncapture={handleKeydown} />

<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-screen bg-black text-white flex items-center justify-center p-4 md:p-8">
	<div class="w-full max-w-4xl border border-neutral-800 flex flex-col md:flex-row min-h-[500px]" style="view-transition-name: main-card;">
		<!-- Left: Main content -->
		<div class="flex-1 flex flex-col items-center justify-center p-8" style="view-transition-name: main-content;">
			<a href="/" class="self-start text-neutral-500 hover:text-white mb-8 text-sm">
				← back <span class="text-neutral-600">[Esc]</span>
			</a>

			<div class="w-full max-w-sm">
				<h1 class="text-2xl font-bold mb-8 text-center">create room</h1>

				<form
					bind:this={formEl}
					method="POST"
					use:enhance={() => {
						loading = true;
						player.save();
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="space-y-6"
				>
					{#if form?.error}
						<div class="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
							{form.error}
						</div>
					{/if}

					<!-- Name input -->
					<div>
						<label for="name" class="block text-neutral-600 text-xs mb-2 uppercase tracking-widest">
							your name
						</label>
						<input
							type="text"
							id="nameInput"
							maxlength="20"
							bind:value={player.name}
							placeholder={player.placeholder}
							class="w-full px-4 py-3 bg-black border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500/50 transition-colors lowercase"
						/>
						<input type="hidden" name="name" value={player.name || player.placeholder} />
					</div>

					<!-- Model selection -->
					<fieldset>
						<legend class="block text-neutral-600 text-xs mb-2 uppercase tracking-widest">
							choose your ai
						</legend>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
							{#each MODELS as model (model.id)}
								<label
									class="relative group block {model.disabled
										? 'cursor-not-allowed opacity-50'
										: 'cursor-pointer'}"
									title={model.disabled ? 'Disabled in production' : ''}
								>
									<input
										type="radio"
										name="model"
										value={model.id}
										checked={model.id === DEFAULT_MODEL}
										disabled={model.disabled}
										class="peer sr-only"
									/>
									<div
										class="p-3 border border-neutral-800 peer-checked:border-orange-500 peer-checked:bg-orange-500/10 peer-focus:ring-2 peer-focus:ring-orange-500/50 peer-focus:ring-offset-1 peer-focus:ring-offset-black transition-colors h-full {model.disabled
											? ''
											: 'hover:border-neutral-600'}"
									>
										<div class="flex items-center justify-between mb-1">
											{#if model.disabled}
												<span class="text-[10px] px-1.5 py-0.5 text-neutral-500 bg-neutral-800">
													disabled
												</span>
											{:else}
												<span
													class="text-xs px-1.5 py-0.5 {model.multiplier < 1
														? 'text-green-400 bg-green-500/10'
														: model.multiplier > 1.3
															? 'text-red-400 bg-red-500/10'
															: 'text-neutral-400 bg-neutral-800'}"
												>
													{model.multiplier}×
												</span>
											{/if}
											<span class="text-[10px] text-neutral-600">{model.provider}</span>
										</div>
										<span
											class="font-medium text-sm block truncate {model.disabled
												? 'line-through'
												: ''}">{model.name}</span
										>
									</div>
								</label>
							{/each}
						</div>
						<p class="text-xs text-neutral-600 mt-2">
							lower multiplier = smarter model = less points
						</p>
					</fieldset>

					<button
						type="submit"
						disabled={loading}
						class="w-full py-4 px-6 bg-orange-500 text-black font-bold text-lg hover:bg-orange-400 transition-colors disabled:opacity-50"
					>
						{loading ? '...' : 'create room'}
					</button>
					<div class="text-neutral-600 text-xs text-center">press Enter</div>
				</form>
			</div>
		</div>

		<!-- Right: Info panel -->
		<div class="hidden md:flex w-72 bg-neutral-950/50 border-l border-neutral-800 flex-col" style="view-transition-name: side-panel;">
			<div class="p-4 border-b border-neutral-800">
				<div class="text-neutral-600 text-[10px] uppercase tracking-widest">how it works</div>
			</div>
			<div class="flex-1 p-4 font-mono text-xs space-y-4">
				<div class="text-neutral-400">
					<span class="text-orange-500">1.</span> create a room
				</div>
				<div class="text-neutral-400">
					<span class="text-orange-500">2.</span> share the code with friends
				</div>
				<div class="text-neutral-400">
					<span class="text-orange-500">3.</span> prompt your AI to build UIs
				</div>
				<div class="text-neutral-400">
					<span class="text-orange-500">4.</span> compete for the best result
				</div>
				<div class="mt-8 pt-4 border-t border-neutral-800 text-neutral-600">
					<div class="mb-2">model multipliers affect your score:</div>
					<div class="text-green-400">0.7× = smarter, less points</div>
					<div class="text-neutral-400">1.0× = balanced</div>
					<div class="text-red-400">1.5× = weaker, more points</div>
					<div class="mt-4 text-neutral-500 text-xs">
						choose wisely based on your prompting skills! <div class="mt-2">(some models may be disabled in production for cost reasons)</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
