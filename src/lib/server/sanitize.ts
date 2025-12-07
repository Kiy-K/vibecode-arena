/**
 * Sanitization utilities for removing sensitive data before sending to clients.
 */

import type { Challenge, Room, PublicChallenge } from '$lib/types/game';

/**
 * Remove sensitive fields from a challenge before sending to client.
 * Strips: referenceCode (the solution), css
 */
export function sanitizeChallenge(challenge: Challenge): PublicChallenge {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { referenceCode, css, ...publicChallenge } = challenge;
	return publicChallenge;
}

/**
 * Remove sensitive fields from a room before sending to client.
 * Strips referenceCode from currentChallenge if present.
 */
export function sanitizeRoom(room: Room): Room {
	if (!room.currentChallenge) {
		return room;
	}

	// Type guard to check if challenge has referenceCode (is full Challenge)
	const challenge = room.currentChallenge as Challenge;
	if (!('referenceCode' in challenge)) {
		return room; // Already sanitized
	}

	return {
		...room,
		currentChallenge: sanitizeChallenge(challenge)
	};
}
