import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions } from './$types';

import { ENABLED_MODEL_IDS, type ModelId } from '$lib/config/models';
import { roomEvents } from '$lib/server/events';
import { RoomService } from '$lib/server/rooms/RoomService';
import { sanitizeRoom } from '$lib/server/sanitize';

const schema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(20)),
	model: v.picklist(ENABLED_MODEL_IDS as unknown as [string, ...string[]]),
	code: v.pipe(v.string(), v.length(6))
});

/**
 * Actions for the join room page - handle form submission to join an existing room
 * and redirect the user to the joined room.  
 */
export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = v.safeParse(schema, data);
		if (!result.success) {
			return fail(400, { error: 'Invalid input', issues: result.issues });
		}

		const joined = RoomService.join(
			result.output.code.toUpperCase(),
			result.output.name,
			result.output.model as ModelId
		);

		if (!joined) {
			return fail(404, { error: 'Room not found or game already started' });
		}

		cookies.set(`player_${joined.room.id}`, joined.playerId, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 2 // 2 hours
		});

		// Notify other players (sandbox is shared - already started by host)
		roomEvents.emit(joined.room.id, 'player_joined', {
			room: sanitizeRoom(joined.room)
		});

		redirect(303, `/${joined.room.code}`);
	}
};
