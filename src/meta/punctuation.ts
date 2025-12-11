/**
 * Punctuation Meta Handlers
 * 
 * Handles punctuation like {.}, {,}, etc.
 */

import { Action, FormatterContext, Case } from '../formatting.js';

/**
 * Handle comma-style punctuation {,}, {:}, {;}
 */
export function metaComma(ctx: FormatterContext, text: string): Action {
  const action = ctx.newAction();
  action.text = text;
  action.prevAttach = true;
  return action;
}

/**
 * Handle stop punctuation {.}, {!}, {?}
 */
export function metaStop(ctx: FormatterContext, text: string): Action {
  const action = ctx.newAction();
  action.prevAttach = true;
  action.text = text;
  action.nextCase = Case.CAP_FIRST_WORD;
  return action;
}
