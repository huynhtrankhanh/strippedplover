/**
 * Mode Meta Handler
 * 
 * Handles {MODE:...} syntax for setting case and space modes.
 */

import { Action, FormatterContext, Case, SPACE } from '../formatting.js';

/**
 * Handle mode meta
 */
export function metaMode(ctx: FormatterContext, cmdline: string): Action {
  const args = cmdline.split(':', 2);
  const mode = args[0].toLowerCase();
  const action = ctx.copyLastAction();

  if (mode === 'set_space') {
    action.spaceChar = args[1] ?? '';
    return action;
  }

  // No argument allowed for other mode directives
  if (args.length > 1) {
    throw new Error(`'${cmdline}' is not a valid mode`);
  }

  switch (mode) {
    case 'caps':
      action.case = Case.UPPER;
      break;
    case 'title':
      action.case = Case.TITLE;
      break;
    case 'lower':
      action.case = Case.LOWER;
      break;
    case 'snake':
      action.spaceChar = '_';
      break;
    case 'camel':
      action.case = Case.TITLE;
      action.spaceChar = '';
      action.nextCase = Case.LOWER_FIRST_CHAR;
      break;
    case 'reset':
      action.spaceChar = SPACE;
      action.case = null;
      break;
    case 'reset_space':
      action.spaceChar = SPACE;
      break;
    case 'reset_case':
      action.case = null;
      break;
    default:
      throw new Error(`'${cmdline}' is not a valid mode`);
  }

  return action;
}
