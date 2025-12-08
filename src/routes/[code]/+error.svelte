<script lang="ts">
	import { page } from '$app/state';

	// Extract room code from URL
	const roomCode = page.params.code;
</script>

<div class="min-h-screen bg-black text-white flex items-center justify-center p-4">
	<div class="text-center max-w-md">
		<div class="text-8xl mb-6 opacity-20">
			{page.status === 404 ? '?' : '!'}
		</div>

		<h1 class="text-3xl font-bold mb-4">
			{#if page.status === 404}
				room not found
			{:else if page.status === 403}
				join required
			{:else}
				something went wrong
			{/if}
		</h1>

		<p class="text-neutral-500 mb-8">
			{#if page.status === 404}
				this room doesn't exist or has expired
			{:else if page.status === 403}
				you need to join this room first
			{:else}
				{page.error?.message || 'an unexpected error occurred'}
			{/if}
		</p>

		<div class="flex flex-col sm:flex-row gap-3 justify-center">
			{#if page.status === 403}
				<a
					href="/join?code={roomCode}"
					class="px-6 py-3 bg-orange-500 text-black font-bold hover:bg-orange-400 transition-colors"
				>
					join room {roomCode}
				</a>
			{:else}
				<a
					href="/join"
					class="px-6 py-3 bg-orange-500 text-black font-bold hover:bg-orange-400 transition-colors"
				>
					join a room
				</a>
				<a
					href="/create"
					class="px-6 py-3 border border-neutral-700 text-white hover:border-neutral-500 transition-colors"
				>
					create room
				</a>
			{/if}
		</div>

		<a
			href="/"
			class="inline-block mt-8 text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
		>
			← back to home
		</a>
	</div>
</div>
