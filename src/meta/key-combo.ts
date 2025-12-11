/**
 * Key Combo Meta Handler
 * 
 * Handles {#key_combo} syntax for literal key combinations.
 */

import { Action, FormatterContext } from '../formatting.js';

/**
 * Handle key combo meta
 */
export function metaKeyCombo(ctx: FormatterContext, combo: string): Action {
  const action = ctx.copyLastAction();
  action.combo = combo;
  return action;
}
