/**
 * Translation Module
 * 
 * This module handles translating streams of strokes into translations.
 */

import { Stroke } from './stroke.js';
import { StenoDictionaryCollection } from './dictionary/steno-dictionary.js';
import * as system from './system/index.js';
import { registry } from './registry.js';

// Escape/unescape for translations
const ESCAPE_RX = /(\\[nrt]|[\n\r\t])/g;
const ESCAPE_REPLACEMENTS: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\\n': '\\\\n',
  '\\r': '\\\\r',
  '\\t': '\\\\t',
};

export function escapeTranslation(translation: string): string {
  return translation.replace(ESCAPE_RX, m => ESCAPE_REPLACEMENTS[m] ?? m);
}

// Unescape translation - simpler approach without lookbehind
function unescapeTranslationInternal(translation: string): string {
  let result = '';
  let i = 0;
  while (i < translation.length) {
    if (translation[i] === '\\' && i + 1 < translation.length) {
      const next = translation[i + 1];
      if (next === '\\' && i + 2 < translation.length) {
        const afterDouble = translation[i + 2];
        if (afterDouble === 'n' || afterDouble === 'r' || afterDouble === 't') {
          // \\n -> \n (literal backslash + letter)
          result += '\\' + afterDouble;
          i += 3;
          continue;
        }
      }
      if (next === 'n') {
        result += '\n';
        i += 2;
        continue;
      } else if (next === 'r') {
        result += '\r';
        i += 2;
        continue;
      } else if (next === 't') {
        result += '\t';
        i += 2;
        continue;
      }
    }
    result += translation[i];
    i++;
  }
  return result;
}

export function unescapeTranslation(translation: string): string {
  return unescapeTranslationInternal(translation);
}

// Legacy macro aliases
const LEGACY_MACROS_ALIASES: Record<string, string> = {
  '{*}': 'retro_toggle_asterisk',
  '{*!}': 'retro_delete_space',
  '{*?}': 'retro_insert_space',
  '{*+}': 'repeat_last_stroke',
};

const MACRO_RX = /^=\w+(:|$)/;

export interface Macro {
  name: string;
  stroke: Stroke;
  cmdline: string;
}

/**
 * Check if a mapping is a macro and return the macro info
 */
function mappingToMacro(mapping: string | null, stroke: Stroke): Macro | null {
  let macro: string | null = null;
  let cmdline = '';

  if (mapping === null) {
    if (stroke.isCorrection) {
      macro = 'undo';
    }
  } else {
    if (LEGACY_MACROS_ALIASES[mapping]) {
      macro = LEGACY_MACROS_ALIASES[mapping];
    } else if (MACRO_RX.test(mapping)) {
      const args = mapping.slice(1).split(':', 2);
      macro = args[0];
      if (args.length === 2) {
        cmdline = args[1];
      }
    }
  }

  return macro ? { name: macro, stroke, cmdline } : null;
}

/**
 * A translation represents a mapping between strokes and text
 */
export class Translation {
  strokes: Stroke[];
  rtfcre: string[];
  english: string | null;
  replaced: Translation[];
  formatting: any[]; // Will be filled by formatter
  isRetrospectiveCommand: boolean;

  constructor(strokes: Stroke[], translation: string | null) {
    this.strokes = strokes;
    this.rtfcre = strokes.map(s => s.rtfcre);
    this.english = translation;
    this.replaced = [];
    this.formatting = [];
    this.isRetrospectiveCommand = false;
  }

  get length(): number {
    return this.strokes.length;
  }

  hasUndo(): boolean {
    // If there is no formatting, all translations can be undone
    if (this.formatting.length === 0) {
      return true;
    }
    if (this.replaced.length > 0) {
      return true;
    }
    for (const a of this.formatting) {
      if (a.text || a.prevReplace) {
        return true;
      }
    }
    return false;
  }

  toString(): string {
    let translation = 'None';
    if (this.english !== null) {
      // Escape backslashes first, then quotes for display
      const escaped = escapeTranslation(this.english)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      translation = `"${escaped}"`;
    }
    return `Translation(${this.rtfcre.join('/')} : ${translation})`;
  }
}

/**
 * Translator state
 */
class TranslatorState {
  translations: Translation[] = [];
  tail: Translation | null = null;

  prev(count?: number): Translation[] | null {
    let prev: Translation[];
    if (count !== undefined) {
      prev = this.translations.slice(0, -count);
    } else {
      prev = this.translations;
    }
    
    if (prev.length > 0) {
      return prev;
    }
    if (this.tail !== null) {
      return [this.tail];
    }
    return null;
  }

  restrictSize(n: number): void {
    let strokeCount = 0;
    let translationCount = 0;

    for (let i = this.translations.length - 1; i >= 0; i--) {
      strokeCount += this.translations[i].length;
      translationCount++;
      if (strokeCount >= n) {
        break;
      }
    }

    const translationIndex = this.translations.length - translationCount;
    if (translationIndex > 0) {
      this.tail = this.translations[translationIndex - 1];
      this.translations.splice(0, translationIndex);
    }
  }
}

export type TranslatorListener = (
  undo: Translation[],
  doTranslations: Translation[],
  prev: Translation[] | null
) => void;

/**
 * Translator - converts strokes to translations
 */
export class Translator {
  private _undoLength = 0;
  private _dictionary: StenoDictionaryCollection;
  private _listeners: Set<TranslatorListener> = new Set();
  private _state: TranslatorState = new TranslatorState();
  private _toUndo: Translation[] = [];
  private _toDo = 0;

  constructor() {
    this._dictionary = new StenoDictionaryCollection();
  }

  async translate(stroke: Stroke): Promise<void> {
    await this.translateStroke(stroke);
    this.flush();
  }

  setDictionary(d: StenoDictionaryCollection): void {
    this._dictionary = d;
  }

  getDictionary(): StenoDictionaryCollection {
    return this._dictionary;
  }

  addListener(callback: TranslatorListener): void {
    this._listeners.add(callback);
  }

  removeListener(callback: TranslatorListener): void {
    this._listeners.delete(callback);
  }

  setMinUndoLength(n: number): void {
    this._undoLength = n;
    this.resizeTranslations();
  }

  flush(extraTranslations?: Translation[]): void {
    let prev: Translation[] | null;
    let doTranslations: Translation[];

    if (this._toDo > 0) {
      prev = this._state.prev(this._toDo);
      doTranslations = this._state.translations.slice(-this._toDo);
    } else {
      prev = this._state.prev();
      doTranslations = [];
    }

    if (extraTranslations) {
      doTranslations = doTranslations.concat(extraTranslations);
    }

    const undo = this._toUndo;
    this._toUndo = [];
    this._toDo = 0;

    if (undo.length > 0 || doTranslations.length > 0) {
      this.output(undo, doTranslations, prev);
    }

    this.resizeTranslations();
  }

  private output(
    undo: Translation[],
    doTranslations: Translation[],
    prev: Translation[] | null
  ): void {
    for (const callback of this._listeners) {
      callback(undo, doTranslations, prev);
    }
  }

  private resizeTranslations(): void {
    this._state.restrictSize(
      Math.max(this._dictionary.longestKey, this._undoLength)
    );
  }

  getState(): TranslatorState {
    return this._state;
  }

  setState(state: TranslatorState): void {
    this._state = state;
  }

  clearState(): void {
    this._state = new TranslatorState();
  }

  async translateStroke(stroke: Stroke): Promise<void> {
    const maxLen = this._dictionary.longestKey;
    const mapping = await this.lookupWithPrefix(maxLen, this._state.translations, [stroke]);
    const macro = mappingToMacro(mapping, stroke);

    if (macro !== null) {
      this.translateMacro(macro);
      return;
    }

    const t =
      // No prefix lookups (note we avoid looking up [stroke] again).
      await this.findLongestMatch(2, maxLen, stroke) ||
      // Return [stroke] result if mapped.
      (mapping !== null && new Translation([stroke], mapping)) ||
      // No direct match, try with suffixes.
      await this.findLongestMatch(1, maxLen, stroke, system.SUFFIX_KEYS) ||
      // Fallback to untranslate.
      new Translation([stroke], null);

    this.translateTranslation(t);
  }

  translateMacro(macro: Macro): void {
    try {
      const macroFn = registry.getPlugin<(translator: Translator, stroke: Stroke, cmdline: string) => void>('macro', macro.name);
      if (macroFn) {
        macroFn(this, macro.stroke, macro.cmdline);
      }
    } catch {
      // Unknown macro, ignore
    }
  }

  translateTranslation(t: Translation): void {
    this.undo(...t.replaced);
    this.do(t);
  }

  untranslateTranslation(t: Translation): void {
    this.undo(t);
    this.do(...t.replaced);
  }

  private undo(...translations: Translation[]): void {
    for (let i = translations.length - 1; i >= 0; i--) {
      const t = translations[i];
      const last = this._state.translations.pop();
      if (last !== t) {
        throw new Error('Undo mismatch');
      }
      if (this._toDo > 0) {
        this._toDo--;
      } else {
        this._toUndo.unshift(t);
      }
    }
  }

  private do(...translations: Translation[]): void {
    this._state.translations.push(...translations);
    this._toDo += translations.length;
  }

  private async findLongestMatch(
    minLen: number,
    maxLen: number,
    stroke: Stroke,
    suffixes: readonly string[] = []
  ): Promise<Translation | null> {
    let possibleSuffixes: Array<[Stroke, string]> = [];

    if (suffixes.length > 0) {
      // Implicit suffix lookup
      possibleSuffixes = await this.lookupInvolvedSuffixes(stroke, suffixes);
      if (possibleSuffixes.length === 0) {
        return null;
      }
    }

    // Figure out how much of the translation buffer can be involved
    let numStrokes = 1;
    let translationCount = 0;

    for (let i = this._state.translations.length - 1; i >= 0; i--) {
      numStrokes += this._state.translations[i].length;
      if (numStrokes > maxLen) {
        break;
      }
      translationCount++;
    }

    const translationIndex = this._state.translations.length - translationCount;
    const translations = this._state.translations.slice(translationIndex);

    // Try to find a match
    for (let i = 0; i <= translations.length; i++) {
      const replaced = translations.slice(i);
      const strokes: Stroke[] = [];
      for (const t of replaced) {
        strokes.push(...t.strokes);
      }
      strokes.push(stroke);

      if (strokes.length < minLen) {
        continue;
      }

      const mapping = await this.lookupWithPrefix(
        maxLen,
        translations.slice(0, i),
        strokes,
        possibleSuffixes
      );

      if (mapping !== null) {
        const t = new Translation(strokes, mapping);
        t.replaced = replaced;
        return t;
      }
    }

    return null;
  }

  private async lookupStrokes(strokes: Stroke[]): Promise<string | null> {
    return this._dictionary.lookup(strokes.map(s => s.rtfcre));
  }

  private async lookupWithSuffix(
    strokes: Stroke[],
    suffixes: Array<[Stroke, string]> = []
  ): Promise<string | null> {
    if (suffixes.length === 0) {
      return this.lookupStrokes(strokes);
    }

    for (const [suffixStroke, suffixMapping] of suffixes) {
      if (!strokes[strokes.length - 1].contains(suffixStroke)) {
        continue;
      }

      const mainStrokes = [
        ...strokes.slice(0, -1),
        strokes[strokes.length - 1].subtract(suffixStroke),
      ];
      const mainMapping = await this.lookupStrokes(mainStrokes);

      if (mainMapping !== null) {
        return mainMapping + ' ' + suffixMapping;
      }
    }

    return null;
  }

  private async lookupInvolvedSuffixes(
    stroke: Stroke,
    suffixes: readonly string[]
  ): Promise<Array<[Stroke, string]>> {
    const possibleSuffixes: Array<[Stroke, string]> = [];

    for (const suffix of suffixes) {
      const suffixStroke = new Stroke(suffix);
      if (!stroke.contains(suffixStroke)) {
        continue;
      }

      const suffixMapping = await this.lookupStrokes([suffixStroke]);
      if (suffixMapping === null) {
        continue;
      }

      possibleSuffixes.push([suffixStroke, suffixMapping]);
    }

    return possibleSuffixes;
  }

  async lookup(strokes: Stroke[], suffixes: readonly string[] = []): Promise<string | null> {
    const result = await this.lookupStrokes(strokes);
    if (result !== null) {
      return result;
    }

    const possibleSuffixes = await this.lookupInvolvedSuffixes(
      strokes[strokes.length - 1],
      suffixes
    );
    if (possibleSuffixes.length === 0) {
      return null;
    }

    return this.lookupWithSuffix(strokes, possibleSuffixes);
  }

  private previousWordIsFinished(lastTranslations: Translation[]): boolean {
    if (lastTranslations.length === 0) {
      return true;
    }
    const formatting = lastTranslations[lastTranslations.length - 1].formatting;
    if (formatting.length === 0) {
      return true;
    }
    return formatting[formatting.length - 1].wordIsFinished;
  }

  private async lookupWithPrefix(
    maxLen: number,
    lastTranslations: Translation[],
    strokes: Stroke[],
    suffixes: Array<[Stroke, string]> = []
  ): Promise<string | null> {
    if (strokes.length < maxLen && this.previousWordIsFinished(lastTranslations)) {
      const mapping = await this.lookupWithSuffix(
        [Stroke.PREFIX_STROKE, ...strokes],
        suffixes
      );
      if (mapping !== null) {
        return mapping;
      }
    }

    if (strokes.length <= maxLen) {
      return this.lookupWithSuffix(strokes, suffixes);
    }

    return null;
  }
}
