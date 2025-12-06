<!--
@id: tabs
@category: component
@title: Tabs
@description: Tab navigation with content panels. Active tab has blue underline and blue text. Clicking a tab shows its content below.
@defaultProps: {"tabs": [{"label": "Tab 1", "content": "Content for Tab 1"}, {"label": "Tab 2", "content": "Content for Tab 2"}, {"label": "Tab 3", "content": "Content for Tab 3"}]}
@timeLimit: 60
-->
<script>
  let { tabs = [] } = $props();
  let activeIndex = $state(0);
</script>

<div style="width: 320px;">
  <div style="display: flex; border-bottom: 2px solid #374151;">
    {#each tabs as tab, i (tab)}
      <button
        onclick={() => activeIndex = i}
        style="
          padding: 12px 20px;
          background: none;
          border: none;
          color: {activeIndex === i ? '#60a5fa' : '#9ca3af'};
          border-bottom: 2px solid {activeIndex === i ? '#60a5fa' : 'transparent'};
          margin-bottom: -2px;
          cursor: pointer;
          font-weight: {activeIndex === i ? 600 : 400};
          transition: all 0.2s;
        "
      >{tab.label}</button>
    {/each}
  </div>
  <div style="padding: 20px; color: #d1d5db;">
    {tabs[activeIndex]?.content}
  </div>
</div>
