<!--
@id: tooltip
@category: interaction
@title: Tooltip
@description: Button with hover tooltip. Tooltip appears above the button with an arrow pointing down. Shows on mouseenter, hides on mouseleave.
@defaultProps: {"text": "Hover me", "tooltip": "This is a tooltip!"}
@timeLimit: 60
-->
<script>
	let { text = 'Hover me', tooltip = 'Tooltip text' } = $props();
	let show = $state(false);
</script>

<div style="position: relative; display: inline-block;">
	<button
		onmouseenter={() => (show = true)}
		onmouseleave={() => (show = false)}
		style="
      padding: 8px 16px;
      background: #3b82f6;
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
    ">{text}</button
	>

	{#if show}
		<div
			style="
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 8px;
      padding: 8px 12px;
      background: #1f2937;
      border-radius: 6px;
      white-space: nowrap;
      font-size: 14px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    "
		>
			{tooltip}
			<div
				style="
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #1f2937;
      "
			></div>
		</div>
	{/if}
</div>
