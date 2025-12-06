/**
 * AI Tools System
 *
 * Tools manage STATE - the AI does the thinking.
 */
export {
	createHintTool,
	getHintsRemaining,
	getHintCost,
	resetHints,
	resetAllHints,
	HINT_COST,
	MAX_HINTS
} from './getHint';

export type { GameTool, HintState } from './types';
export type { HintToolContext, HintResult } from './getHint';

import { createHintTool, type HintToolContext } from './getHint';

/** Get tools as AI SDK format with context baked in */
export function getToolsForAI(context: HintToolContext) {
	const hintTool = createHintTool(context);
	return {
		get_hint: hintTool.tool
	};
}
