import type { Actions } from './$types';

import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { dev } from '$app/environment';

import { type ModelId } from '$lib/config/models';
import { room, sandbox } from '$lib/server/do-client';
import { SandboxManager } from '$lib/server/e2b';
import { joinRoomSchema } from '$lib/validation/schemas';
import { createLogger } from '$lib/server/logger';

const log = createLogger('JoinRoom');

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = v.safeParse(joinRoomSchema, data);
		if (!result.success) {
			return fail(400, { error: 'Invalid input', issues: result.issues });
		}

		const roomCode = result.output.code.toUpperCase();

		// Join room via DO
		const joined = await room.join(
			roomCode,
			result.output.name,
			result.output.model as ModelId
		);

		if (!joined || 'error' in joined || !('room' in joined) || !joined.room) {
			const errorMsg = (joined && 'error' in joined) ? joined.error : 'Room not found or game already started';
			return fail(404, { error: errorMsg });
		}

		cookies.set(`player_${joined.room.id}`, joined.playerId, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: 60 * 60 * 2
		});

		// Store room code in cookie for WebSocket reconnection
		cookies.set(`room_code`, roomCode, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: 60 * 60 * 2
		});

		// DO broadcasts player_joined automatically

		// If sandbox is already ready, mark this player as ready in the DO
		// This triggers room_sandbox_ready broadcast so the joiner gets notified
		if (SandboxManager.isReady(joined.room.id)) {
			log.info('Sandbox already ready, marking joiner as ready', {
				roomCode,
				playerId: joined.playerId
			});
			await sandbox.setReady(roomCode, joined.playerId).catch(() => {});
		}

		redirect(303, `/${roomCode}`);
	}
};
