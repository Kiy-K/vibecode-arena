import type { Actions } from './$types';

import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { dev } from '$app/environment';

import { ENABLED_MODEL_IDS, type ModelId } from '$lib/config/models';
import { room } from '$lib/server/do-client';

const schema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(20)),
	model: v.picklist(ENABLED_MODEL_IDS as unknown as [string, ...string[]]),
	code: v.pipe(v.string(), v.length(6))
});

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = v.safeParse(schema, data);
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

		if (!joined || 'error' in joined) {
			return fail(404, { error: joined?.error || 'Room not found or game already started' });
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

		redirect(303, `/${roomCode}`);
	}
};
