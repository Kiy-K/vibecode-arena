import { mount } from 'svelte';

const playerId = window.PLAYER_ID || 'default';
const modules = import.meta.glob('./solutions/*.svelte');
const modulePath = `./solutions/${playerId}.svelte`;

const loader = modules[modulePath] || modules['./solutions/default.svelte'];

if (loader) {
  loader().then((mod) => {
    mount(mod.default, { target: document.getElementById('app') });
  });
} else {
  document.getElementById('app').innerHTML =
    '<div style="padding:20px;color:#666">No solution loaded</div>';
}
