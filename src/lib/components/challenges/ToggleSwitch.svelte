<!--
@id: toggle-switch
@category: interaction
@title: Toggle Switch
@description: A toggle switch that changes between ON (green) and OFF (gray) states when clicked. The knob slides smoothly from left to right.
@defaultProps: {"isOn": false}
@timeLimit: 60
-->
<script>
  let { isOn = false, onToggle } = $props();
  let on = $state(false);

  // Sync from prop when it changes (for animations)
  $effect(() => {
    on = isOn;
  });

  function toggle() {
    on = !on;
    onToggle?.(on);
  }
</script>

<button
  onclick={toggle}
  aria-label="Toggle switch"
  style="
    width: 56px;
    height: 32px;
    border-radius: 16px;
    background: {on ? '#22c55e' : '#374151'};
    border: none;
    padding: 2px;
    cursor: pointer;
    transition: background 0.2s;
  "
>
  <div
    style="
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: white;
      transform: translateX({on ? '24px' : '0'});
      transition: transform 0.2s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    "
  ></div>
</button>
