/**
 * Confetti effects for celebrations.
 */

import confetti from 'canvas-confetti';

/**
 * Fire a celebratory confetti burst.
 * Used when a player passes a challenge.
 */
export function fireSuccessConfetti() {
	confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
	setTimeout(() => {
		confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
		confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
	}, 250);
}
