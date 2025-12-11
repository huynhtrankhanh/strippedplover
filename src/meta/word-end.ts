/**
 * Word End Meta Handler
 * 
 * Handles {$} for explicit word end marking.
 */

import { Action, FormatterContext } from '../formatting.js';

/**
 * Handle word end meta
 */
export function metaWordEnd(ctx: FormatterContext, _meta: string): Action {
  const action = ctx.copyLastAction();
  action.wordIsFinished = true;
  return action;
}
