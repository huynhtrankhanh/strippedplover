/**
 * Conditional Meta Handler
 * 
 * Handles {=pattern/result1/result2} conditional syntax.
 */

import { Action, FormatterContext } from '../formatting.js';

// Pattern to split conditional meta
const IF_NEXT_META_RX = /((?:[^\\/]|\\\\|\\\/)*)\/?/g;
const IF_NEXT_ESCAPE_RX = /\\([\\/])/g;

/**
 * A look-ahead action that can change based on next text
 */
export class LookAheadAction extends Action {
  pattern: string;
  action1: Action;
  action2: Action;
  currentAction: Action;

  constructor(pattern: string, action1: Action, action2: Action) {
    super();
    this.pattern = pattern;
    this.action1 = action1;
    this.action2 = action2;
    this.currentAction = this.update('');
  }

  update(text: string): Action {
    const rx = new RegExp(this.pattern);
    if (rx.test(text)) {
      this.currentAction = this.action1;
    } else {
      this.currentAction = this.action2;
    }
    
    // Copy properties from current action
    Object.assign(this, this.currentAction);
    return this.currentAction;
  }
}

/**
 * Handle conditional meta {=pattern/result1/result2}
 */
export function metaIfNextMatches(ctx: FormatterContext, meta: string): Action {
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  
  // Reset regex lastIndex
  IF_NEXT_META_RX.lastIndex = 0;
  
  while ((match = IF_NEXT_META_RX.exec(meta)) !== null) {
    if (match[1] !== undefined) {
      parts.push(match[1].replace(IF_NEXT_ESCAPE_RX, '$1'));
    }
    if (IF_NEXT_META_RX.lastIndex >= meta.length) break;
  }

  const [pattern, result1, result2] = parts.filter(p => p !== undefined);

  const action1 = ctx.newAction();
  action1.text = result1 ?? '';

  const action2 = ctx.newAction();
  action2.text = result2 ?? '';

  return new LookAheadAction(pattern ?? '', action1, action2);
}
