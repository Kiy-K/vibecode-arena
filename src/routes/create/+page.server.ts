import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions } from './$types';

import { ENABLED_MODEL_IDS, type ModelId } from '$lib/config/models';
import { RoomService } from '$lib/server/rooms/RoomService';
import { roomEvents } from '$lib/server/events';
import { startRoomSandbox } from '$lib/server/e2b';
import { createLogger } from '$lib/server/logger';
import { sanitizeRoom } from '$lib/server/sanitize';

const log = createLogger('CreateRoom');

const schema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(20)),
	model: v.picklist(ENABLED_MODEL_IDS as unknown as [string, ...string[]])
});

/**
 * Actions for the create room page - handle form submission to create a new room
 * and redirect the user to the newly created room.  
 */
export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = v.safeParse(schema, data);
		if (!result.success) {
			return fail(400, { error: 'Invalid input', issues: result.issues });
		}

		const room = RoomService.create(result.output.name, result.output.model as ModelId);
		const playerId = room.players[0].id;

		cookies.set(`player_${room.id}`, playerId, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 2 // 2 hours
		});

		// Start room sandbox in background (ONE sandbox for the whole room!)
		startRoomSandbox(room.id)
			.then(() => {
				const updatedRoom = RoomService.getById(room.id);
				if (updatedRoom) {
					roomEvents.emit(room.id, 'room_sandbox_ready', {
						room: sanitizeRoom(updatedRoom)
					});
				}
			})
			.catch((err) => {
				log.error('Failed to start room sandbox', { roomId: room.id, error: String(err) });
			});

		redirect(303, `/${room.code}`);
	}
};
