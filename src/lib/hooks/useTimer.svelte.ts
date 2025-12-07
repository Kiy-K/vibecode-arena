/**
 * Game timer hook.
 * Manages the countdown timer for challenge time limits.
 * Automatically cleans up on component destruction.
 *
 * @example
 * ```ts
 * const timer = useTimer();
 * timer.start(300); // Start 5 minute timer
 * // timer.timeLeft decreases each second
 * timer.stop(); // Stop early (e.g., on submission)
 * formatTime(timer.timeLeft); // "4:32"
 * ```
 */

import { onDestroy } from 'svelte';

/**
 * Creates a game timer that counts down from a given number of seconds.
 * Automatically stops at 0 and cleans up on component destruction.
 *
 * @returns Timer state and controls
 */
export function useTimer() {
	/** Remaining time in seconds */
	let timeLeft = $state(0);
	/** Interval reference for cleanup */
	let interval: ReturnType<typeof setInterval> | null = null;

	/**
	 * Start the timer from a given number of seconds.
	 * @param seconds - Number of seconds to count down from
	 */
	function start(seconds: number) {
		stop();
		timeLeft = seconds;
		interval = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) stop();
		}, 1000);
	}

	/**
	 * Stop the timer.
	 */
	function stop() {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
	}

	// Cleanup on component destruction
	onDestroy(stop);

	return {
		/** Remaining time in seconds */
		get timeLeft() { return timeLeft; },
		start,
		stop
	};
}

/**
 * Format seconds into a human-readable time string.
 *
 * @param seconds - Time in seconds
 * @returns Formatted string like "4:32" or "0:05"
 *
 * @example
 * ```ts
 * formatTime(272); // "4:32"
 * formatTime(5);   // "0:05"
 * formatTime(0);   // "0:00"
 * ```
 */
export function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}
