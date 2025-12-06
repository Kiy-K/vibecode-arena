// SSE for real-time updates
type Listener = (data: string) => void;

class RoomEvents {
	private listeners = new Map<string, Set<Listener>>();

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

	emit(roomId: string, event: string, data: unknown): void {
		const listeners = this.listeners.get(roomId);
		if (!listeners) return;

		const message = JSON.stringify({ event, data, timestamp: Date.now() });
		listeners.forEach((listener) => listener(message));
	}
}

export const roomEvents = new RoomEvents();
