/**
 * Glue Meta Handler
 * 
 * Handles {&...} glue syntax for fingerspelling and numbers.
 */

import { Action, FormatterContext } from '../formatting.js';

/**
 * Handle glue meta
 */
export function metaGlue(ctx: FormatterContext, text: string): Action {
  const action = ctx.newAction();
  action.glue = true;
  action.text = text;

  if (ctx.lastAction.glue) {
    action.prevAttach = true;
  }

  return action;
}
