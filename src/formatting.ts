/**
 * Formatting Module
 * 
 * This module converts translations to printable text with
 * support for plover's custom dictionary language.
 */

import { registry } from './registry.js';
import { Translation } from './translation.js';

// Case enum
export enum Case {
  CAP_FIRST_WORD = 'cap_first_word',
  LOWER = 'lower',
  LOWER_FIRST_CHAR = 'lower_first_char',
  TITLE = 'title',
  UPPER = 'upper',
  UPPER_FIRST_WORD = 'upper_first_word',
}

export const SPACE = ' ';

export const META_ATTACH_FLAG = '^';
export const META_CARRY_CAPITALIZATION = '~|';
export const META_GLUE_FLAG = '&';

export const META_ESCAPE = '\\';
export const META_START = '{';
export const META_END = '}';
export const META_ESC_START = META_ESCAPE + META_START;
export const META_ESC_END = META_ESCAPE + META_END;

// Word regex for finding words in text
export const WORD_RX = /(?:\d+(?:[.,]\d+)+|['\w]+[-\w']*|[^\w\s]+)\s*/gu;

// Atom regex for parsing translations
const ATOM_PATTERN = new RegExp(
  `(?:\\\\\\{|\\\\\\}|[^{}])+|\\{(?:\\\\\\{|\\\\\\}|[^{}])*\\}`,
  'g'
);

/**
 * Parse meta commands from a translation
 */
function parseMeta(meta: string): [string | null, string | null] {
  // Generic {:macro:cmdline} syntax
  let match = meta.match(/^:([^:]+):?(.*)$/);
  if (match) {
    return [match[1], match[2]];
  }

  // Command: PLOVER:xxx
  match = meta.match(/^PLOVER:(.*)$/i);
  if (match) {
    return ['command', match[1]];
  }

  // Key combination: #xxx
  match = meta.match(/^#(.*)$/);
  if (match) {
    return ['key_combo', match[1]];
  }

  // Punctuation
  if (/^[,:;]$/.test(meta)) {
    return ['comma', meta];
  }
  if (/^[.!?]$/.test(meta)) {
    return ['stop', meta];
  }

  // Case modifiers
  if (meta === '-|') return ['case', Case.CAP_FIRST_WORD];
  if (meta === '>') return ['case', Case.LOWER_FIRST_CHAR];
  if (meta === '<') return ['case', Case.UPPER_FIRST_WORD];
  if (meta === '*-|') return ['retro_case', Case.CAP_FIRST_WORD];
  if (meta === '*>') return ['retro_case', Case.LOWER_FIRST_CHAR];
  if (meta === '*<') return ['retro_case', Case.UPPER_FIRST_WORD];

  // Explicit word end
  if (meta === '$') return ['word_end', meta];

  // Conditional
  match = meta.match(/^=(.*)$/);
  if (match) {
    return ['if_next_matches', match[1]];
  }

  // Mode
  match = meta.match(/^MODE:(.*)$/i);
  if (match) {
    return ['mode', match[1]];
  }

  // Currency
  match = meta.match(/^\*\((.*)\)$/);
  if (match) {
    return ['retro_currency', match[1]];
  }

  // Glue
  if (meta.startsWith(META_GLUE_FLAG)) {
    return ['glue', meta.slice(1)];
  }

  // Carry capitalization
  if (meta.includes(META_CARRY_CAPITALIZATION)) {
    return ['carry_capitalize', meta];
  }

  // Attach (prefix/suffix/infix)
  if (meta.startsWith(META_ATTACH_FLAG) || meta.endsWith(META_ATTACH_FLAG)) {
    return ['attach', meta];
  }

  return [null, null];
}

/**
 * Action class representing formatting instructions and state
 */
export class Action {
  // Previous state
  prevAttach: boolean = false;
  prevReplace: string = '';

  // Current state
  glue: boolean = false;
  word: string | null = null;
  orthography: boolean = true;
  spaceChar: string = ' ';
  upperCarry: boolean = false;
  case: Case | null = null;
  text: string | null = null;
  trailingSpace: string = '';
  wordIsFinished: boolean = true;
  combo: string | null = null;
  command: string | null = null;

  // Next state
  nextAttach: boolean = false;
  nextCase: Case | null = null;

  constructor(init?: Partial<Action>) {
    if (init) {
      Object.assign(this, init);
    }
    if (this.wordIsFinished === undefined) {
      this.wordIsFinished = !this.nextAttach;
    }
  }

  /**
   * Create a new action with only global state copied
   */
  newState(): Action {
    return new Action({
      prevAttach: this.nextAttach,
      spaceChar: this.spaceChar,
      case: this.case,
      trailingSpace: this.trailingSpace,
    });
  }

  /**
   * Clone this action including all state
   */
  copyState(): Action {
    return new Action({
      prevAttach: this.nextAttach,
      case: this.case,
      glue: this.glue,
      orthography: this.orthography,
      spaceChar: this.spaceChar,
      upperCarry: this.upperCarry,
      word: this.word,
      trailingSpace: this.trailingSpace,
      wordIsFinished: this.wordIsFinished,
      nextAttach: this.nextAttach,
      nextCase: this.nextCase,
    });
  }

  equals(other: Action): boolean {
    return (
      this.prevAttach === other.prevAttach &&
      this.prevReplace === other.prevReplace &&
      this.glue === other.glue &&
      this.word === other.word &&
      this.orthography === other.orthography &&
      this.spaceChar === other.spaceChar &&
      this.upperCarry === other.upperCarry &&
      this.case === other.case &&
      this.text === other.text &&
      this.trailingSpace === other.trailingSpace &&
      this.wordIsFinished === other.wordIsFinished &&
      this.combo === other.combo &&
      this.command === other.command &&
      this.nextAttach === other.nextAttach &&
      this.nextCase === other.nextCase
    );
  }
}

/**
 * Context for formatting translations
 */
export class FormatterContext {
  previousTranslations: Translation[];
  lastAction: Action;
  translatedActions: Action[] = [];

  constructor(previousTranslations: Translation[], lastAction: Action) {
    this.previousTranslations = previousTranslations;
    this.lastAction = lastAction;
  }

  newAction(): Action {
    return this.lastAction.newState();
  }

  copyLastAction(): Action {
    return this.lastAction.copyState();
  }

  translated(action: Action): void {
    this.translatedActions.push(action);
    this.lastAction = action;
  }

  /**
   * Iterate over past actions (last first)
   */
  *iterLastActions(): Generator<Action> {
    yield* this.translatedActions.slice().reverse();
    for (let i = this.previousTranslations.length - 1; i >= 0; i--) {
      const formatting = this.previousTranslations[i].formatting;
      for (let j = formatting.length - 1; j >= 0; j--) {
        yield formatting[j];
      }
    }
  }

  /**
   * Iterate over last text fragments
   */
  *iterLastFragments(): Generator<string> {
    const FRAGMENT_RX = /\s*[^\s]+\s*|^\s*$/g;
    let replace = 0;
    let nextAction: Action | null = null;
    let currentFragment = '';

    for (const action of this.iterLastActions()) {
      let part = action.text ?? '';
      if (nextAction !== null && nextAction.text !== null && !nextAction.prevAttach) {
        part += nextAction.spaceChar;
      }

      if (replace > 0) {
        if (part.length > replace) {
          part = part.slice(0, -replace);
          replace = 0;
        } else {
          replace -= part.length;
          part = '';
        }
      }

      if (part) {
        const fragments = (part + currentFragment).match(FRAGMENT_RX) ?? [];
        for (let i = fragments.length - 1; i >= 1; i--) {
          yield fragments[i];
        }
        currentFragment = fragments[0] ?? '';
      }

      replace += action.prevReplace.length;
      nextAction = action;
    }

    if (currentFragment && !currentFragment.match(/^\s*$/)) {
      yield currentFragment.trimStart();
    }
  }

  /**
   * Get the last n fragments
   */
  lastFragments(count: number = 1): string[] {
    const fragments: string[] = [];
    for (const fragment of this.iterLastFragments()) {
      fragments.unshift(fragment);
      if (fragments.length === count) {
        break;
      }
    }
    return fragments;
  }

  /**
   * Iterate over last words
   */
  *iterLastWords(strip: boolean = false): Generator<string> {
    for (const fragment of this.iterLastFragments()) {
      const words = fragment.match(WORD_RX) ?? [];
      for (let i = words.length - 1; i >= 0; i--) {
        yield strip ? words[i].trimEnd() : words[i];
      }
    }
  }

  /**
   * Get the last n words
   */
  lastWords(count: number = 1, strip: boolean = false): string[] {
    const words: string[] = [];
    for (const word of this.iterLastWords(strip)) {
      words.unshift(word);
      if (words.length === count) {
        break;
      }
    }
    return words;
  }

  /**
   * Get the last n characters of text
   */
  lastText(size: number): string {
    let text = '';
    if (size === 0) return text;

    for (const fragment of this.iterLastFragments()) {
      text = fragment + text;
      if (text.length >= size) {
        break;
      }
    }

    return text.slice(-size);
  }
}

/**
 * Output type for formatter
 */
export interface FormatterOutput {
  sendBackspaces: (count: number) => void;
  sendString: (text: string) => void;
  sendKeyCombination: (combo: string) => void;
  sendEngineCommand: (command: string) => void;
}

export type FormatterListener = (old: Action[], newActions: Action[]) => void;

/**
 * Formatter - converts translations to output actions
 */
export class Formatter {
  private _output: FormatterOutput | null = null;
  private _listeners: Set<FormatterListener> = new Set();
  
  spacesAfter: boolean = false;
  lastOutputSpacesAfter: boolean = false;
  startCapitalized: boolean = false;
  startAttached: boolean = false;
  spaceChar: string = ' ';

  addListener(callback: FormatterListener): void {
    this._listeners.add(callback);
  }

  removeListener(callback: FormatterListener): void {
    this._listeners.delete(callback);
  }

  setOutput(output: FormatterOutput | null): void {
    this._output = output;
  }

  setSpacePlacement(s: string): void {
    this.spacesAfter = s === 'After Output';
  }

  lastAction(previousTranslations: Translation[] | null): Action {
    if (previousTranslations && previousTranslations.length > 0) {
      const lastTrans = previousTranslations[previousTranslations.length - 1];
      if (lastTrans.formatting.length > 0) {
        return lastTrans.formatting[lastTrans.formatting.length - 1];
      }
    }
    return new Action({
      nextAttach: this.startAttached || this.spacesAfter,
      nextCase: this.startCapitalized ? Case.CAP_FIRST_WORD : null,
      spaceChar: this.spaceChar,
    });
  }

  format(
    undo: Translation[],
    doTranslations: Translation[],
    prev: Translation[] | null
  ): void {
    let newActions: Action[] = [];

    if (doTranslations.length > 0) {
      const lastAct = this.lastAction(prev);
      const ctx = new FormatterContext(prev ?? [], lastAct);

      for (const t of doTranslations) {
        if (t.english) {
          t.formatting = translationToActions(t.english, ctx);
        } else {
          t.formatting = rawToActions(t.rtfcre[0], ctx);
        }
      }
      newActions = ctx.translatedActions;
    }

    const oldActions: Action[] = [];
    for (const t of undo) {
      oldActions.push(...t.formatting);
    }

    // Find common prefix
    const minLength = Math.min(oldActions.length, newActions.length);
    let i = 0;
    for (; i < minLength; i++) {
      if (!oldActions[i].equals(newActions[i])) {
        break;
      }
    }

    const optimizedAway = oldActions.slice(0, i);
    const actualOld = oldActions.slice(i);
    const actualNew = newActions.slice(i);

    // Notify listeners
    for (const callback of this._listeners) {
      callback(actualOld, actualNew);
    }

    // Render output
    if (this._output) {
      let lastAct: Action | null = null;
      if (optimizedAway.length > 0) {
        lastAct = optimizedAway[optimizedAway.length - 1];
      } else if (prev && prev.length > 0 && prev[prev.length - 1].formatting.length > 0) {
        lastAct = prev[prev.length - 1].formatting[prev[prev.length - 1].formatting.length - 1];
      }

      this.renderOutput(lastAct, actualOld, actualNew);
    }

    this.lastOutputSpacesAfter = this.spacesAfter;
  }

  private renderOutput(lastAction: Action | null, undo: Action[], doActions: Action[]): void {
    if (!this._output) return;

    const before = new TextFormatter(this.lastOutputSpacesAfter);
    const after = new TextFormatter(this.spacesAfter);

    // Render undone actions
    for (const action of before.render(undo, lastAction)) {
      // Non-text actions are ignored during undo
    }

    // Render new actions
    for (const action of after.render(doActions, lastAction)) {
      this.flush(before, after);
      if (action.combo) {
        this._output.sendKeyCombination(action.combo);
      } else if (action.command) {
        this._output.sendEngineCommand(action.command);
      }
    }

    this.flush(before, after);
  }

  private flush(before: TextFormatter, after: TextFormatter): void {
    if (!this._output) return;

    let replacedText: string;
    if (before.replacedText.length > after.replacedText.length) {
      replacedText = before.replacedText;
    } else {
      replacedText = after.replacedText;
    }

    const beforeText =
      replacedText.slice(0, replacedText.length - before.replacedText.length) +
      before.appendedText;
    const afterText =
      replacedText.slice(0, replacedText.length - after.replacedText.length) +
      after.appendedText;

    // Find common prefix
    let commonLength = 0;
    const minLen = Math.min(beforeText.length, afterText.length);
    for (let i = 0; i < minLen; i++) {
      if (beforeText[i] !== afterText[i]) break;
      commonLength++;
    }

    const erased = beforeText.length - commonLength;
    if (erased > 0) {
      this._output.sendBackspaces(erased);
    }

    const appended = afterText.slice(commonLength);
    if (appended) {
      this._output.sendString(appended);
    }

    before.reset(after.trailingSpace);
    after.reset(after.trailingSpace);
  }
}

/**
 * Helper class for text formatting
 */
class TextFormatter {
  private spacesAfter: boolean;
  replacedText: string = '';
  appendedText: string = '';
  trailingSpace: string = '';

  constructor(spacesAfter: boolean) {
    this.spacesAfter = spacesAfter;
  }

  *render(actionList: Action[], lastAction: Action | null): Generator<Action> {
    if (this.spacesAfter && lastAction !== null) {
      this.trailingSpace = lastAction.trailingSpace;
      this.appendedText = lastAction.trailingSpace;
    }

    for (const action of actionList) {
      if (action.text === null) {
        yield action;
      } else {
        this.renderAction(action);
      }
    }
  }

  private renderAction(action: Action): void {
    if (this.spacesAfter && this.trailingSpace) {
      if (this.appendedText.endsWith(this.trailingSpace)) {
        this.appendedText = this.appendedText.slice(0, -this.trailingSpace.length);
      }
    }

    if (action.prevReplace) {
      const replaced = action.prevReplace.length;
      const appended = this.appendedText.length;

      if (replaced > appended) {
        const fromReplaced = replaced - appended;
        if (fromReplaced > this.replacedText.length) {
          this.replacedText = action.prevReplace.slice(0, fromReplaced);
        }
        this.appendedText = '';
      } else {
        this.appendedText = this.appendedText.slice(0, -replaced);
      }
    }

    if (!action.prevAttach) {
      this.appendedText += action.spaceChar;
    }

    this.appendedText += action.text;

    if (this.spacesAfter && !action.nextAttach) {
      this.appendedText += action.spaceChar;
      this.trailingSpace = action.spaceChar;
    } else {
      this.trailingSpace = '';
    }
  }

  reset(trailingSpace: string): void {
    this.replacedText = '';
    this.appendedText = trailingSpace;
  }
}

// ============================================================================
// Translation to Actions Helpers
// ============================================================================

/**
 * Convert a translation string to actions
 */
function translationToActions(translation: string, ctx: FormatterContext): Action[] {
  // Handle digit-only translations as glue
  if (/^\d+$/.test(translation)) {
    translation = `{${META_GLUE_FLAG}${translation}}`;
  }

  const atoms = (translation.match(ATOM_PATTERN) ?? [])
    .map(x => x.trim())
    .filter(x => x.length > 0);

  const actionList: Action[] = [];
  for (const atom of atoms) {
    const action = atomToAction(atom, ctx);
    actionList.push(action);
    ctx.translated(action);
  }

  if (actionList.length === 0) {
    const action = ctx.copyLastAction();
    actionList.push(action);
    ctx.translated(action);
  }

  return actionList;
}

/**
 * Convert a raw stroke to actions
 */
function rawToActions(stroke: string, ctx: FormatterContext): Action[] {
  // If raw stroke is digits, handle as glue
  const noDash = stroke.replace('-', '');
  if (/^\d+$/.test(noDash)) {
    return translationToActions(noDash, ctx);
  }

  const action = new Action({
    text: stroke,
    word: stroke,
    case: ctx.lastAction.case,
    prevAttach: ctx.lastAction.nextAttach,
    spaceChar: ctx.lastAction.spaceChar,
    trailingSpace: ctx.lastAction.spaceChar,
  });

  ctx.translated(action);
  return [action];
}

/**
 * Get meta content from an atom
 */
function getMeta(atom: string): string | null {
  if (atom.startsWith(META_START) && atom.endsWith(META_END)) {
    return atom.slice(1, -1);
  }
  return null;
}

/**
 * Unescape atom text
 */
function unescapeAtom(atom: string): string {
  return atom
    .replace(META_ESC_START, META_START)
    .replace(META_ESC_END, META_END);
}

/**
 * Convert an atom to an action
 */
function atomToAction(atom: string, ctx: FormatterContext): Action {
  const meta = getMeta(atom);

  if (meta !== null) {
    const unescapedMeta = unescapeAtom(meta);
    return metaToAction(unescapedMeta, ctx);
  }

  const action = ctx.newAction();
  action.text = unescapeAtom(atom);
  finalizeAction(action, ctx);
  return action;
}

/**
 * Convert a meta command to an action
 */
function metaToAction(meta: string, ctx: FormatterContext): Action {
  const [metaName, metaArg] = parseMeta(meta);

  if (metaName !== null) {
    try {
      const metaFn = registry.getPlugin<(ctx: FormatterContext, arg: string | null) => Action>('meta', metaName);
      if (metaFn) {
        const action = metaFn(ctx, metaArg);
        finalizeAction(action, ctx);
        return action;
      }
    } catch {
      // Unknown meta, fall through
    }
  }

  const action = ctx.newAction();
  finalizeAction(action, ctx);
  return action;
}

/**
 * Finalize an action's text
 */
function finalizeAction(action: Action, ctx: FormatterContext): void {
  const text = action.text;
  if (text === null) return;

  // Update word
  if (action.word === null) {
    let lastWord: string | null = null;
    if (action.glue && ctx.lastAction.glue) {
      lastWord = ctx.lastAction.word;
    }
    action.word = rightmostWord((lastWord ?? '') + text);
  }

  // Apply case
  let caseMode = ctx.lastAction.nextCase;
  if (caseMode === null && action.prevAttach && ctx.lastAction.upperCarry) {
    caseMode = Case.UPPER_FIRST_WORD;
  }
  let finalText = applyCase(text, caseMode);

  if (caseMode === Case.UPPER_FIRST_WORD) {
    action.upperCarry = !hasWordBoundary(finalText);
  }

  // Apply mode
  finalText = applyMode(
    finalText,
    action.case,
    action.spaceChar,
    action.prevAttach,
    ctx.lastAction
  );

  action.text = finalText;

  // Update trailing space
  action.trailingSpace = action.nextAttach ? '' : action.spaceChar;
}

// ============================================================================
// Case and Mode Helpers
// ============================================================================

export function applyCase(text: string, caseMode: Case | null): string {
  if (caseMode === null) return text;

  switch (caseMode) {
    case Case.CAP_FIRST_WORD:
      return capitalizeFirstWord(text);
    case Case.LOWER_FIRST_CHAR:
      return lowerFirstCharacter(text);
    case Case.UPPER_FIRST_WORD:
      return upperFirstWord(text);
    default:
      return text;
  }
}

function applyMode(
  text: string,
  caseMode: Case | null,
  spaceChar: string,
  begin: boolean,
  lastAction: Action
): string {
  // Should title case be applied?
  const lowerTitleCase = begin && (lastAction.case === null || 
    (lastAction.case !== Case.CAP_FIRST_WORD && lastAction.case !== Case.UPPER_FIRST_WORD));

  // Apply case, then replace space character
  text = applyModeCase(text, caseMode, lowerTitleCase);
  text = applyModeSpaceChar(text, spaceChar);

  // Title case is sensitive to lower flag
  if (lastAction.nextCase === Case.LOWER_FIRST_CHAR && text && caseMode === Case.TITLE) {
    text = lowerFirstCharacter(text);
  }

  return text;
}

function applyModeCase(text: string, caseMode: Case | null, appended: boolean): string {
  if (caseMode === null) return text;

  switch (caseMode) {
    case Case.LOWER:
      return text.toLowerCase();
    case Case.UPPER:
      return text.toUpperCase();
    case Case.TITLE:
      // Do nothing to appended output
      if (appended) return text;
      return capitalizeAllWords(text);
    default:
      return text;
  }
}

function applyModeSpaceChar(text: string, spaceChar: string): string {
  if (spaceChar === SPACE) return text;
  return text.replace(/ /g, spaceChar);
}

// ============================================================================
// String Helpers
// ============================================================================

export function capitalizeFirstWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function capitalizeAllWords(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function lowerFirstCharacter(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function upperFirstWord(s: string): string {
  const match = s.match(WORD_RX);
  if (!match) return s;
  const firstWord = match[0];
  return firstWord.toUpperCase() + s.slice(firstWord.length);
}

export function rightmostWord(s: string): string {
  const words = s.match(WORD_RX);
  if (!words || words.length === 0) return '';
  const lastWord = words[words.length - 1];
  if (lastWord.endsWith(' ') || lastWord.endsWith('\t')) return '';
  return lastWord;
}

export function hasWordBoundary(s: string): boolean {
  if (!s) return false;
  if (s.charAt(0).match(/\s/) || s.charAt(s.length - 1).match(/\s/)) return true;
  const words = s.match(WORD_RX);
  return words !== null && words.length > 1;
}
