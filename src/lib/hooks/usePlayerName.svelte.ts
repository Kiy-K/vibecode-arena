/**
 * Player name hook.
 * Manages player name input with localStorage persistence.
 * Provides a random placeholder name for new players.
 *
 * @example
 * ```ts
 * const playerName = usePlayerName();
 * // playerName.placeholder is a random name like "Swift Eagle"
 * playerName.name = 'John'; // User types their name
 * playerName.save(); // Persist to localStorage
 * // On next visit, playerName.name is restored from localStorage
 * ```
 */

import { onMount } from 'svelte';
import { generateRandomName } from '$lib/utils/nameGenerator';

/** LocalStorage key for persisted player name */
const STORAGE_KEY = 'playerName';

/**
 * Creates player name state with localStorage persistence.
 *
 * @returns Player name state and controls
 */
export function usePlayerName() {
	/** Current player name (empty if not set) */
	let name = $state('');
	/** Random placeholder name for the input field */
	const placeholder = generateRandomName();

	// Load saved name from localStorage on mount
	onMount(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) name = saved;
	});

	/**
	 * Save the current name to localStorage.
	 * Only saves if name is not empty after trimming.
	 */
	function save() {
		if (name.trim()) {
			localStorage.setItem(STORAGE_KEY, name.trim());
		}
	}

	return {
		/** Current player name (always lowercase) */
		get name() { return name; },
		set name(v: string) { name = v.toLowerCase(); },
		/** Random placeholder name (lowercase) */
		placeholder: placeholder.toLowerCase(),
		save
	};
}
