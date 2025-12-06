import { onMount } from 'svelte';
import { generateRandomName } from '$lib/utils/nameGenerator';

const STORAGE_KEY = 'playerName';

export function usePlayerName() {
	let name = $state('');
	const placeholder = generateRandomName();

	onMount(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) name = saved;
	});

	function save() {
		if (name.trim()) {
			localStorage.setItem(STORAGE_KEY, name.trim());
		}
	}

	return {
		get name() { return name; },
		set name(v: string) { name = v; },
		placeholder,
		save
	};
}
