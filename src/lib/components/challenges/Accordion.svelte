<!--
@id: accordion
@category: component
@title: Accordion
@description: Collapsible accordion with multiple sections. Only one section open at a time. Arrow rotates 180° when open. Smooth height animation.
@defaultProps: {"items": [{"title": "Section 1", "content": "Content for section 1"}, {"title": "Section 2", "content": "Content for section 2"}, {"title": "Section 3", "content": "Content for section 3"}]}
@timeLimit: 60
-->
<script lang="ts">
	let { items = [] } = $props();
	let openIndex: number | null = $state(null);
</script>

<div style="width: 320px; border: 1px solid #374151; border-radius: 8px; overflow: hidden;">
	{#each items as item, i (item.title)}
		<div>
			<button
				onclick={() => (openIndex = openIndex === i ? null : i)}
				style="
          width: 100%;
          padding: 12px 16px;
          background: #1f2937;
          border: none;
          border-bottom: 1px solid #374151;
          color: white;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 500;
        "
			>
				<span>{item.title}</span>
				<span style="transform: rotate({openIndex === i ? 180 : 0}deg); transition: transform 0.2s;"
					>▼</span
				>
			</button>
			<div
				style="
          max-height: {openIndex === i ? '200px' : '0'};
          overflow: hidden;
          transition: max-height 0.3s;
          background: #111827;
        "
			>
				<div style="padding: 16px; color: #9ca3af;">{item.content}</div>
			</div>
		</div>
	{/each}
</div>
