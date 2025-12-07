/**
 * Shared validation schemas.
 * Used by server actions and tested directly.
 */
import * as v from 'valibot';
import { ENABLED_MODEL_IDS } from '$lib/config/models';

/** Schema for creating a new room */
export const createRoomSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(20)),
	model: v.picklist(ENABLED_MODEL_IDS as unknown as [string, ...string[]])
});

/** Schema for joining an existing room */
export const joinRoomSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(20)),
	model: v.picklist(ENABLED_MODEL_IDS as unknown as [string, ...string[]]),
	code: v.pipe(v.string(), v.length(6))
});

/** Type for create room form data */
export type CreateRoomInput = v.InferOutput<typeof createRoomSchema>;

/** Type for join room form data */
export type JoinRoomInput = v.InferOutput<typeof joinRoomSchema>;
