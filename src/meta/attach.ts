/**
 * Attach Meta Handler
 * 
 * Handles {^...} attach syntax in translations.
 */

import { Action, FormatterContext, Case, META_ATTACH_FLAG, META_CARRY_CAPITALIZATION, hasWordBoundary, rightmostWord } from '../formatting.js';
import { addSuffix } from '../orthography.js';

/**
 * Handle attach meta (prefix/suffix/infix)
 */
export function metaAttach(ctx: FormatterContext, meta: string): Action {
  const action = ctx.newAction();
  let begin = meta.startsWith(META_ATTACH_FLAG);
  let end = meta.endsWith(META_ATTACH_FLAG);
  let content = meta;

  if (!begin && !end) {
    // If not specified, attach at both ends
    content = META_ATTACH_FLAG + meta + META_ATTACH_FLAG;
    begin = end = true;
  }

  if (begin) {
    content = content.slice(META_ATTACH_FLAG.length);
    action.prevAttach = true;
  }

  if (end) {
    content = content.slice(0, -META_ATTACH_FLAG.length);
    action.nextAttach = true;
    action.wordIsFinished = false;
  }

  const lastWord = ctx.lastAction.word ?? '';

  if (!content) {
    // Empty connection indicates a "break" in orthography rules
    action.orthography = false;
  } else if (
    lastWord &&
    !content.match(/^\s+$/) &&
    ctx.lastAction.orthography &&
    begin &&
    (!end || hasWordBoundary(content))
  ) {
    // Apply orthography rules
    const newWord = addSuffix(lastWord, content);
    let commonLen = 0;
    for (let i = 0; i < Math.min(lastWord.length, newWord.length); i++) {
      if (lastWord[i] === newWord[i]) {
        commonLen++;
      } else {
        break;
      }
    }
    const replaced = lastWord.slice(commonLen);
    action.prevReplace = ctx.lastText(replaced.length);
    content = newWord.slice(commonLen);
  }

  action.text = content;

  if (action.prevAttach) {
    action.word = rightmostWord(lastWord + content);
  }

  return action;
}

/**
 * Handle carry capitalize meta {~|...}
 */
export function metaCarryCapitalize(ctx: FormatterContext, meta: string): Action {
  const action = ctx.newAction();

  if (ctx.lastAction.nextCase === Case.CAP_FIRST_WORD) {
    action.nextCase = Case.CAP_FIRST_WORD;
  }

  let content = meta;
  const begin = content.startsWith(META_ATTACH_FLAG);
  if (begin) {
    content = content.slice(META_ATTACH_FLAG.length);
    action.prevAttach = true;
  }

  content = content.slice(META_CARRY_CAPITALIZATION.length);

  const end = content.endsWith(META_ATTACH_FLAG);
  if (end) {
    content = content.slice(0, -META_ATTACH_FLAG.length);
    action.nextAttach = true;
    action.wordIsFinished = false;
  }

  if (content || begin || end) {
    action.text = content;
  }

  return action;
}
