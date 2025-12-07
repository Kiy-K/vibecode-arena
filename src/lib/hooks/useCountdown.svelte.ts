/**
 * Reusable countdown hook.
 * Manages a countdown timer that decrements every second.
 *
 * @example
 * ```ts
 * const countdown = useCountdown();
 * countdown.start(10); // Start 10 second countdown
 * // countdown.value decreases each second
 * // countdown.isActive is true while running
 * countdown.stop(); // Stop early
 * countdown.reset(); // Stop and set value to 0
 * ```
 */

/**
 * Creates a countdown timer that decrements by 1 each second.
 * Automatically stops when reaching 0.
 *
 * @returns Countdown state and controls
 */
export function useCountdown() {
	let value = $state(0);
	let intervalRef: ReturnType<typeof setInterval> | null = null;

	/**
	 * Start the countdown from a given number of seconds.
	 * Stops any existing countdown before starting.
	 * @param seconds - Number of seconds to count down from
	 */
	function start(seconds: number) {
		stop();
		value = seconds;
		intervalRef = setInterval(() => {
			value--;
			if (value <= 0) stop();
		}, 1000);
	}

	/**
	 * Stop the countdown without resetting the value.
	 */
	function stop() {
		if (intervalRef) {
			clearInterval(intervalRef);
			intervalRef = null;
		}
	}

	/**
	 * Stop the countdown and reset value to 0.
	 */
	function reset() {
		stop();
		value = 0;
	}

	return {
		/** Current countdown value in seconds */
		get value() {
			return value;
		},
		/** Whether the countdown is currently running */
		get isActive() {
			return intervalRef !== null;
		},
		start,
		stop,
		reset
	};
}
