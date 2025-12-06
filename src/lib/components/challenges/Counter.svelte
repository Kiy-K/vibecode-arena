<!--
@id: counter
@category: interaction
@title: Counter
@description: Counter with + and - buttons. Red circle button decrements, green circle button increments. Count displayed in center with bold font.
@defaultProps: {"initial": 0}
@timeLimit: 60
-->
<script>
  let { initial = 0 } = $props();
  let count = $state(0);

  // Sync from prop when it changes (for animations)
  $effect(() => {
    count = initial;
  });
</script>

<div style="display: flex; align-items: center; gap: 16px;">
  <button
    onclick={() => count--}
    style="
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: #ef4444;
      color: white;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    "
  >−</button>
  <span style="font-size: 32px; font-weight: 700; min-width: 60px; text-align: center;">
    {count}
  </span>
  <button
    onclick={() => count++}
    style="
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: #22c55e;
      color: white;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    "
  >+</button>
</div>
