/**
 * Case Meta Handlers
 */

import { Action, FormatterContext, Case, applyCase } from '../formatting.js';

/**
 * Handle case meta {-|}, {>}, {<}
 */
export function metaCase(ctx: FormatterContext, caseArg: string): Action {
  const caseMode = caseArg as Case;
  const action = ctx.copyLastAction();
  action.nextCase = caseMode;
  return action;
}

/**
 * Handle retro case meta {*-|}, {*>}, {*<}
 */
export function metaRetroCase(ctx: FormatterContext, caseArg: string): Action {
  const caseMode = caseArg as Case;
  const action = ctx.copyLastAction();
  action.prevAttach = true;

  const lastWords = ctx.lastWords(1);
  if (lastWords.length > 0) {
    action.prevReplace = lastWords[0];
    action.text = applyCase(lastWords[0], caseMode);
  } else {
    action.text = '';
  }

  return action;
}
