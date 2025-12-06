import type { RequestHandler } from './$types';
import { roomEvents } from '$lib/server/events';
import { RoomService } from '$lib/server/rooms/RoomService';
import { sanitizeRoom } from '$lib/server/sanitize';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const room = RoomService.getByCode(params.code);
	if (!room) {
		return new Response('Room not found', { status: 404 });
	}

	// Get player ID from cookie for connection tracking
	const playerId = cookies.get(`player_${room.id}`);

	// Track this connection
	if (playerId) {
		RoomService.trackConnection(room.id, playerId);
	}

	let unsubscribe: (() => void) | null = null;
	let isClosed = false;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send initial state (sanitized to hide referenceCode)
			try {
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify({ event: 'connected', data: { room: sanitizeRoom(room) } })}\n\n`)
				);
			} catch {
				isClosed = true;
				return;
			}

			// Subscribe to room events
			unsubscribe = roomEvents.subscribe(room.id, (message) => {
				if (isClosed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${message}\n\n`));
				} catch {
					// Controller closed, cleanup
					isClosed = true;
					unsubscribe?.();
				}
			});
		},
		cancel() {
			// Called when client disconnects
			isClosed = true;
			unsubscribe?.();

			// Untrack connection - may trigger room cleanup if finished
			if (playerId) {
				RoomService.untrackConnection(room.id, playerId);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
