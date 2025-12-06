import type { Component } from 'svelte';

// Auto-import all challenge components
const modules = import.meta.glob('./*.svelte', { eager: true }) as Record<
	string,
	{ default: Component }
>;

// Convert filename to kebab-case id (e.g., ToggleSwitch.svelte -> toggle-switch)
function toKebabCase(filename: string): string {
	return filename
		.replace('./', '')
		.replace('.svelte', '')
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.toLowerCase();
}

// Build component map: { 'toggle-switch': ToggleSwitchComponent, ... }
export const REFERENCE_COMPONENTS: Record<string, Component> = Object.fromEntries(
	Object.entries(modules).map(([path, mod]) => [toKebabCase(path), mod.default])
);
