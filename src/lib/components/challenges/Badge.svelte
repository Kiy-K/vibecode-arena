<!--
@id: badge
@category: component
@title: Notification Badge
@description: Notification badge with count. Shows 99+ if count exceeds 99. Red badge on blue icon box. Badge hidden when count is 0.
@defaultProps: {"count": 5}
@animateProps: {"count": [0, 120]}
@timeLimit: 60
-->
<script>
	let { count = 0, icon = '🔔' } = $props();
	let displayCount = $derived(count > 99 ? '99+' : count);
</script>

<div style="position: relative; display: inline-block;">
	<div
		style="
    width: 48px;
    height: 48px;
    background: #3b82f6;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  "
	>
		{icon}
	</div>

	{#if count > 0}
		<div
			style="
      position: absolute;
      top: -8px;
      right: -8px;
      min-width: 22px;
      height: 22px;
      background: #ef4444;
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      padding: 0 6px;
      border: 2px solid #111;
    "
		>
			{displayCount}
		</div>
	{/if}
</div>
