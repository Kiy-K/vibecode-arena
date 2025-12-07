import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions } from './$types';
import { dev } from '$app/environment';

import { ENABLED_MODEL_IDS, type ModelId } from '$lib/config/models';
import { room, sandbox } from '$lib/server/do-client';
import { startRoomSandbox } from '$lib/server/e2b';
import { createLogger } from '$lib/server/logger';

const log = createLogger('CreateRoom');

const schema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(20)),
	model: v.picklist(ENABLED_MODEL_IDS as unknown as [string, ...string[]])
});

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = v.safeParse(schema, data);
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
				// Notify DO that sandbox is ready
				await sandbox.setReady(newRoom.code, playerId).catch(() => {});
			})
			.catch((err) => {
				log.error('Failed to start room sandbox', { roomId: newRoom.id, error: String(err) });
			});

		// Use waitUntil to keep the worker alive for background work
		if (platform?.context?.waitUntil) {
			platform.context.waitUntil(sandboxPromise);
		}

		redirect(303, `/${newRoom.code}`);
	}
};
