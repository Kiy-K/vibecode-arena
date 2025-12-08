<!--
@id: progress-bar
@category: component
@title: Progress Bar
@description: Progress bar (0-100). Color changes: RED (<33%), YELLOW (33-65%), GREEN (>65%). Percentage shown centered. Rounded corners.
@defaultProps: {"percentage": 65}
@animateProps: {"percentage": [0, 100]}
@timeLimit: 60
-->
<script>
	let { percentage = 0 } = $props();
	let clamped = $derived(Math.min(100, Math.max(0, percentage)));
	let color = $derived(clamped < 33 ? '#ef4444' : clamped < 66 ? '#f59e0b' : '#22c55e');
</script>

<div style="width: 280px;">
	<div
		style="
    height: 24px;
    background: #374151;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
  "
	>
		<div
			style="
      height: 100%;
      width: {clamped}%;
      background: {color};
      border-radius: 12px;
      transition: width 0.3s;
    "
		></div>
		<span
			style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-weight: 600;
      font-size: 14px;
    ">{clamped}%</span
		>
	</div>
</div>
