/**
 * E2B sandbox type definitions.
 */
import type { Sandbox } from 'e2b';

/** Room sandbox session data */
export interface RoomSandbox {
	sandbox: Sandbox;
	roomId: string;
	createdAt: number;
	lastActivity: number;
	serverReady: boolean;
}

/** Log callback function type */
export type LogCallback = (message: string) => void;
