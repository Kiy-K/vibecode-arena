import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions } from './$types';
import { dev } from '$app/environment';

import { type ModelId } from '$lib/config/models';
import { room, sandbox } from '$lib/server/do-client';
import { startRoomSandbox } from '$lib/server/e2b';
import { createLogger } from '$lib/server/logger';
import { createRoomSchema } from '$lib/validation/schemas';
import { generateRandomName } from '$lib/utils/nameGenerator';

const log = createLogger('CreateRoom');

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = v.safeParse(createRoomSchema, data);
		if (!result.success) {
			return fail(400, { error: 'Invalid input', issues: result.issues });
		}

		// Sanitize name: replace spaces with underscores, trim, lowercase
		const sanitizedName = result.output.name
			.replace(/\s+/g, '_')
			.replace(/^_+|_+$/g, '')
			.toLowerCase();
		// Use placeholder from form (what user saw) if name is empty, fallback to random
		const placeholder = String(data.placeholder || '')
			.replace(/\s+/g, '_')
			.replace(/^_+|_+$/g, '')
			.toLowerCase();
		const playerName =
			sanitizedName.replace(/_/g, '').length > 0
				? sanitizedName
				: placeholder || generateRandomName().toLowerCase();

		// Create room via DO
		const { room: newRoom, playerId } = await room.create(
			playerName,
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

		// Skip sandbox creation if E2E_SKIP_SANDBOX is set (for fast lobby-only tests)
		const skipSandbox = process.env.E2E_SKIP_SANDBOX === 'true';

		if (!skipSandbox) {
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
			const ctx = platform as
				| { context?: { waitUntil?: (p: Promise<unknown>) => void } }
				| undefined;
			if (ctx?.context?.waitUntil) {
				ctx.context.waitUntil(sandboxPromise);
			}
		}

		redirect(303, `/${newRoom.code}`);
	}
};
