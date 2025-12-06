/**
 * Server-Sent Events (SSE) manager for real-time room updates.
 * Provides pub/sub for game events like round starts, submissions, and state changes.
 */

/** Event listener callback type */
type Listener = (data: string) => void;

/**
 * Manages SSE subscriptions and event broadcasting per room.
 */
class RoomEvents {
	private listeners = new Map<string, Set<Listener>>();

	/**
	 * Subscribe to events for a room.
	 * @param roomId - Room to subscribe to
	 * @param listener - Callback for incoming events
	 * @returns Unsubscribe function
	 */
	subscribe(roomId: string, listener: Listener): () => void {
		if (!this.listeners.has(roomId)) {
			this.listeners.set(roomId, new Set());
		}
		this.listeners.get(roomId)!.add(listener);

		return () => {
			this.listeners.get(roomId)?.delete(listener);
			if (this.listeners.get(roomId)?.size === 0) {
				this.listeners.delete(roomId);
			}
		};
	}

	/**
	 * Broadcast an event to all subscribers of a room.
	 * @param roomId - Target room
	 * @param event - Event name
	 * @param data - Event payload
	 */
	emit(roomId: string, event: string, data: unknown): void {
		const listeners = this.listeners.get(roomId);
		if (!listeners) return;

		const message = JSON.stringify({ event, data, timestamp: Date.now() });
		listeners.forEach((listener) => listener(message));
	}
}

/** Singleton room events manager */
export const roomEvents = new RoomEvents();
