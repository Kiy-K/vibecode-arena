<!--
@id: star-rating
@category: interaction
@title: Star Rating
@description: 5-star rating component. Stars fill yellow up to the current rating. Hovering previews the rating before clicking.
@defaultProps: {"rating": 3}
@animateProps: {"rating": [1, 5]}
@timeLimit: 60
-->
<script>
	let { rating = 3, onRate } = $props();
	let current = $state(3);
	let hover = $state(0);

	// Sync from prop when it changes (for animations)
	$effect(() => {
		current = rating;
	});
</script>

<div style="display: flex; gap: 4px;">
	{#each [1, 2, 3, 4, 5] as star (star)}
		<button
			type="button"
			onclick={() => {
				current = star;
				onRate?.(star);
			}}
			onmouseenter={() => (hover = star)}
			onmouseleave={() => (hover = 0)}
			style="
        font-size: 32px;
        cursor: pointer;
        color: {star <= (hover || current) ? '#facc15' : '#4b5563'};
        transition: color 0.15s;
        background: none;
        border: none;
        padding: 0;
      ">★</button
		>
	{/each}
</div>
