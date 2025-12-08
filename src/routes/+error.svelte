<!--
  Error page - Displays HTTP errors (404, 403, 500, etc.)
  Matches the site's dark theme style.
-->
<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} | vibecode arena</title>
</svelte:head>

<div class="min-h-screen bg-black text-white flex items-center justify-center p-4 md:p-8">
	<div class="w-full max-w-md border border-neutral-800 p-8 text-center">
		<div class="text-6xl font-mono font-bold text-orange-500 mb-4">
			{page.status}
		</div>

		<h1 class="text-2xl font-bold mb-4">
			{#if page.status === 404}
				room not found
			{:else if page.status === 403}
				access denied
			{:else}
				something went wrong
			{/if}
		</h1>

		<p class="text-neutral-400 mb-8">
			{#if page.error?.message}
				{page.error.message}
			{:else if page.status === 404}
				this room doesn't exist or has expired.
			{:else if page.status === 403}
				you need to join this room first.
			{:else}
				an unexpected error occurred.
			{/if}
		</p>

		<div class="space-y-3">
			<a
				href="/join"
				class="block w-full py-3 px-6 bg-orange-500 text-black font-bold hover:bg-orange-400 transition-colors"
			>
				join a room
			</a>
			<a
				href="/"
				class="block w-full py-3 px-6 border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white transition-colors"
			>
				go home
			</a>
		</div>
	</div>
</div>
