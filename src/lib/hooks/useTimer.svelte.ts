import { onDestroy } from 'svelte';

export function useTimer() {
	let timeLeft = $state(0);
	let interval: ReturnType<typeof setInterval> | null = null;

	function start(seconds: number) {
		stop();
		timeLeft = seconds;
		interval = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) stop();
		}, 1000);
	}

	function stop() {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
	}

	onDestroy(stop);

	return {
		get timeLeft() { return timeLeft; },
		start,
		stop
	};
}

export function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}
