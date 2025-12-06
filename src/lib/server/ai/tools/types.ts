/**
 * Types for AI tools system.
 * Tools manage STATE - the AI does the thinking.
 */

/** Tool definition with metadata */
export interface GameTool {
	name: string;
	description: string;
	costPoints?: number; // Points deducted for using this tool
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tool: any; // AI SDK tool type
}

/** Hint state returned by the hint tool */
export interface HintState {
	success: boolean;
	hintsUsed: number;
	hintsRemaining: number;
	maxHints: number;
	pointsCost: number;
	hintLevel: number | null;
	guidance: string;
}
