/**
 * Vibecode Arena Worker
 *
 * Entry point for Cloudflare Worker with Durable Objects.
 * Routes requests to the appropriate GameRoom DO instance.
 */

import { GameRoom } from './GameRoom';
import { generateRoomCode } from '$lib/config/game';

export { GameRoom };

export interface Env {
	GAME_ROOMS: DurableObjectNamespace<GameRoom>;
	FRONTEND_URL?: string;
}

// CORS headers for cross-origin requests from frontend
function corsHeaders(origin: string | null, env: Env): HeadersInit {
	const allowedOrigin = env.FRONTEND_URL || origin || '*';
	return {
		'Access-Control-Allow-Origin': allowedOrigin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Max-Age': '86400'
	};
}

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const origin = request.headers.get('Origin');

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders(origin, env) });
		}

		// Health check
		if (url.pathname === '/health') {
			return new Response('OK', { headers: corsHeaders(origin, env) });
		}

		// Route: /room/:code - Access a room by its code
		const roomMatch = url.pathname.match(/^\/room\/([A-Z0-9]{6})$/i);
		if (roomMatch) {
			const code = roomMatch[1].toUpperCase();
			const roomId = env.GAME_ROOMS.idFromName(code);
			const room = env.GAME_ROOMS.get(roomId);

			const response = await room.fetch(request);

			// Add CORS headers to response
			const newResponse = new Response(response.body, response);
			Object.entries(corsHeaders(origin, env)).forEach(([key, value]) => {
				newResponse.headers.set(key, value);
			});

			return newResponse;
		}

		// Route: /create - Create a new room
		if (url.pathname === '/create' && request.method === 'POST') {
			// Generate the room code - this IS the DO name
			const roomCode = generateRoomCode();
			const roomId = env.GAME_ROOMS.idFromName(roomCode);
			const room = env.GAME_ROOMS.get(roomId);

			const body = (await request.json()) as {
				hostName: string;
				hostModel: string;
				challenges: unknown[];
			};

			// Call createRoom on the DO, passing the code and pre-picked challenges
			const doRequest = new Request(request.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					method: 'createRoom',
					params: {
						code: roomCode,
						hostName: body.hostName,
						hostModel: body.hostModel,
						challenges: body.challenges
					}
				})
			});

			const response = await room.fetch(doRequest);
			const result = (await response.json()) as { room: { code: string }; playerId: string };

			return Response.json(result, { headers: corsHeaders(origin, env) });
		}

		// Route: /join/:code - Join an existing room
		const joinMatch = url.pathname.match(/^\/join\/([A-Z0-9]{6})$/i);
		if (joinMatch && request.method === 'POST') {
			const code = joinMatch[1].toUpperCase();
			const roomId = env.GAME_ROOMS.idFromName(code);
			const room = env.GAME_ROOMS.get(roomId);

			const body = (await request.json()) as { playerName: string; model: string };

			const doRequest = new Request(request.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					method: 'joinRoom',
					params: { playerName: body.playerName, model: body.model }
				})
			});

			const response = await room.fetch(doRequest);
			const result = await response.json();

			if (!result) {
				return Response.json(
					{ error: 'Room not found or not joinable' },
					{
						status: 404,
						headers: corsHeaders(origin, env)
					}
				);
			}

			return Response.json(result, { headers: corsHeaders(origin, env) });
		}

		return new Response('Not Found', { status: 404, headers: corsHeaders(origin, env) });
	}
} satisfies ExportedHandler<Env>;
