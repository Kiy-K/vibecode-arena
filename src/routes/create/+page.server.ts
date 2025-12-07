import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions } from './$types';
import { dev } from '$app/environment';

import { type ModelId } from '$lib/config/models';
import { room, sandbox } from '$lib/server/do-client';
import { startRoomSandbox } from '$lib/server/e2b';
import { createLogger } from '$lib/server/logger';
import { createRoomSchema } from '$lib/validation/schemas';

const log = createLogger('CreateRoom');

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = v.safeParse(createRoomSchema, data);
		if (!result.success) {
			return fail(400, { error: 'Invalid input', issues: result.issues });
		}

		// Create room via DO
		const { room: newRoom, playerId } = await room.create(
			result.output.name,
			result.output.model as ModelId
		);

		cookies.set(`player_${newRoom.id}`, playerId, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: 60 * 60 * 2
		});

		// Store room code in cookie for WebSocket reconnection
		cookies.set(`room_code`, newRoom.code, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: 60 * 60 * 2
		});

		// Start sandbox in background using waitUntil to keep worker alive
		const sandboxPromise = startRoomSandbox(newRoom.id, newRoom.code)
			.then(async () => {
				// Notify DO that sandbox is ready for ALL players in the room
				await sandbox.setRoomReady(newRoom.code).catch(() => {});
			})
			.catch((err) => {
				log.error('Failed to start room sandbox', { roomId: newRoom.id, error: String(err) });
			});

		// Use waitUntil to keep the worker alive for background work
		const ctx = platform as { context?: { waitUntil?: (p: Promise<unknown>) => void } } | undefined;
		if (ctx?.context?.waitUntil) {
			ctx.context.waitUntil(sandboxPromise);
		}

		redirect(303, `/${newRoom.code}`);
	}
};
