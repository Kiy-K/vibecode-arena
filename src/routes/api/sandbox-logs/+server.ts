import { SandboxManager } from '$lib/server/e2b';
import type { RequestHandler } from './$types';

/**
 * Handle GET requests to stream sandbox logs for a specific player
 * via Server-Sent Events (SSE) connection - used by the frontend to display logs in real-time
 */
export const GET: RequestHandler = async ({ url }) => {
	const playerId = url.searchParams.get('playerId');

	if (!playerId) {
		return new Response('Missing playerId', { status: 400 });
	}

	let unsubscribe: (() => void) | null = null;
	let isClosed = false;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send initial connection message
			try {
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify({ type: 'connected', playerId })}\n\n`)
				);
			} catch {
				isClosed = true;
				return;
			}

			// Subscribe to sandbox logs for this player
			unsubscribe = SandboxManager.subscribeToLogs(playerId, (message) => {
				if (isClosed) return;
				try {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify({ type: 'log', message })}\n\n`)
					);
				} catch {
					isClosed = true;
					unsubscribe?.();
				}
			});
		},
		cancel() {
			isClosed = true;
			unsubscribe?.();
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
