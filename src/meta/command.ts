/**
 * Command Meta Handler
 * 
 * Handles {PLOVER:command} syntax in translations.
 */

import { Action, FormatterContext } from '../formatting.js';

/**
 * Handle command meta
 * In stripped plover, engine commands are passed through for handling
 */
export function metaCommand(ctx: FormatterContext, command: string): Action {
  const action = ctx.copyLastAction();
  action.command = command;
  return action;
}
