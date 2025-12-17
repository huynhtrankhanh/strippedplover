/**
 * Browser Steno Engine
 * 
 * Main entry point for the stenography engine in the browser.
 * This uses browser-compatible dictionary storage.
 */

import { 
  Stroke, 
  normalizeSteno, 
  setupStroke, 
  type StrokeConfig,
  KEYS,
  IMPLICIT_HYPHEN_KEYS,
  SUFFIX_KEYS,
  NUMBER_KEY,
  NUMBERS,
  UNDO_STROKE_STENO,
} from '@strippedplover/shared';
import { StenoDictionary, StenoDictionaryCollection, type StenoDictionaryLike } from './browser-dictionary';

// Re-export commonly used types
export { Stroke, normalizeSteno };
export { StenoDictionary, StenoDictionaryCollection, type StenoDictionaryLike };
export type { StrokeConfig };
export { KEYS, IMPLICIT_HYPHEN_KEYS, SUFFIX_KEYS, NUMBER_KEY, NUMBERS, UNDO_STROKE_STENO };

/**
 * Setup the English Stenotype system
 */
export function setupEnglishStenotype(): void {
  const config: StrokeConfig = {
    keys: KEYS,
    implicitHyphenKeys: new Set(IMPLICIT_HYPHEN_KEYS),
    numberKey: NUMBER_KEY,
    numbers: new Map(Object.entries(NUMBERS)),
    feralNumberKey: true,
    undoStrokeSteno: UNDO_STROKE_STENO,
  };
  
  setupStroke(config);
}

// Initialize on import
setupEnglishStenotype();

// ============================================================================
// Output Types
// ============================================================================

export interface OutputElement {
  type: 'committed' | 'keypress' | 'preedit';
  text?: string;
  combo?: string;
}

export interface StartingStrokeState {
  attach: boolean;
  capitalize: boolean;
  spaceChar: string;
}

export interface DictionaryInfo {
  path: string;
  enabled: boolean;
  readonly: boolean;
  entries: number;
}

// ============================================================================
// Translation
// ============================================================================

interface Translation {
  strokes: Stroke[];
  rtfcre: string[];
  english: string | null;
  replaced: Translation[];
  formatting: FormattingAction[];
}

interface FormattingAction {
  prevAttach: boolean;
  prevReplace: string;
  text: string | null;
  nextAttach: boolean;
  nextCase: string | null;
  spaceChar: string;
  glue: boolean;
  combo: string | null;
  command: string | null;
}

function createTranslation(strokes: Stroke[], translation: string | null): Translation {
  return {
    strokes,
    rtfcre: strokes.map(s => s.rtfcre),
    english: translation,
    replaced: [],
    formatting: [],
  };
}

// ============================================================================
// Translator
// ============================================================================

class TranslatorState {
  translations: Translation[] = [];
  tail: Translation | null = null;

  prev(count?: number): Translation[] | null {
    const prev = count !== undefined 
      ? this.translations.slice(0, -count)
      : this.translations;
    
    if (prev.length > 0) return prev;
    if (this.tail !== null) return [this.tail];
    return null;
  }

  restrictSize(n: number): void {
    let strokeCount = 0;
    let translationCount = 0;

    for (let i = this.translations.length - 1; i >= 0; i--) {
      strokeCount += this.translations[i].strokes.length;
      translationCount++;
      if (strokeCount >= n) break;
    }

    const translationIndex = this.translations.length - translationCount;
    if (translationIndex > 0) {
      this.tail = this.translations[translationIndex - 1];
      this.translations.splice(0, translationIndex);
    }
  }
}

type TranslatorListener = (
  undo: Translation[],
  doTranslations: Translation[],
  prev: Translation[] | null
) => void;

class Translator {
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

  addListener(callback: TranslatorListener): void {
    this._listeners.add(callback);
  }

  flush(): void {
    let prev: Translation[] | null;
    let doTranslations: Translation[];

    if (this._toDo > 0) {
      prev = this._state.prev(this._toDo);
      doTranslations = this._state.translations.slice(-this._toDo);
    } else {
      prev = this._state.prev();
      doTranslations = [];
    }

    const undo = this._toUndo;
    this._toUndo = [];
    this._toDo = 0;

    if (undo.length > 0 || doTranslations.length > 0) {
      for (const callback of this._listeners) {
        callback(undo, doTranslations, prev);
      }
    }

    this._state.restrictSize(Math.max(this._dictionary.longestKey, this._undoLength));
  }

  clearState(): void {
    this._state = new TranslatorState();
  }

  private async translateStroke(stroke: Stroke): Promise<void> {
    const maxLen = this._dictionary.longestKey;

    // Handle undo stroke
    if (stroke.isCorrection) {
      this.handleUndo();
      return;
    }

    // Look up the stroke
    const mapping = await this.lookupWithPrefix(maxLen, this._state.translations, [stroke]);
    
    const t =
      (await this.findLongestMatch(2, maxLen, stroke)) ||
      (mapping !== null && createTranslation([stroke], mapping)) ||
      (await this.findLongestMatch(1, maxLen, stroke, SUFFIX_KEYS as unknown as readonly string[])) ||
      createTranslation([stroke], null);

    this.translateTranslation(t);
  }

  private handleUndo(): void {
    if (this._state.translations.length > 0) {
      const last = this._state.translations[this._state.translations.length - 1];
      this.undo(last);
      this.doTranslations(...last.replaced);
    }
  }

  private translateTranslation(t: Translation): void {
    this.undo(...t.replaced);
    this.doTranslations(t);
  }

  private undo(...translations: Translation[]): void {
    for (let i = translations.length - 1; i >= 0; i--) {
      const t = translations[i];
      this._state.translations.pop();
      if (this._toDo > 0) {
        this._toDo--;
      } else {
        this._toUndo.unshift(t);
      }
    }
  }

  private doTranslations(...translations: Translation[]): void {
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
      possibleSuffixes = await this.lookupInvolvedSuffixes(stroke, suffixes);
      if (possibleSuffixes.length === 0) return null;
    }

    let numStrokes = 1;
    let translationCount = 0;

    for (let i = this._state.translations.length - 1; i >= 0; i--) {
      numStrokes += this._state.translations[i].strokes.length;
      if (numStrokes > maxLen) break;
      translationCount++;
    }

    const translationIndex = this._state.translations.length - translationCount;
    const translations = this._state.translations.slice(translationIndex);

    for (let i = 0; i <= translations.length; i++) {
      const replaced = translations.slice(i);
      const strokes: Stroke[] = [];
      for (const t of replaced) {
        strokes.push(...t.strokes);
      }
      strokes.push(stroke);

      if (strokes.length < minLen) continue;

      const mapping = await this.lookupWithPrefix(
        maxLen,
        translations.slice(0, i),
        strokes,
        possibleSuffixes
      );

      if (mapping !== null) {
        const t = createTranslation(strokes, mapping);
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
      if (!strokes[strokes.length - 1].contains(suffixStroke)) continue;

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
      if (!stroke.contains(suffixStroke)) continue;

      const suffixMapping = await this.lookupStrokes([suffixStroke]);
      if (suffixMapping === null) continue;

      possibleSuffixes.push([suffixStroke, suffixMapping]);
    }

    return possibleSuffixes;
  }

  private async lookupWithPrefix(
    maxLen: number,
    lastTranslations: Translation[],
    strokes: Stroke[],
    suffixes: Array<[Stroke, string]> = []
  ): Promise<string | null> {
    const previousWordIsFinished = lastTranslations.length === 0 ||
      lastTranslations[lastTranslations.length - 1].formatting.length === 0 ||
      lastTranslations[lastTranslations.length - 1].formatting[
        lastTranslations[lastTranslations.length - 1].formatting.length - 1
      ]?.nextAttach === false;

    if (strokes.length < maxLen && previousWordIsFinished) {
      const mapping = await this.lookupWithSuffix(
        [Stroke.PREFIX_STROKE, ...strokes],
        suffixes
      );
      if (mapping !== null) return mapping;
    }

    if (strokes.length <= maxLen) {
      return this.lookupWithSuffix(strokes, suffixes);
    }

    return null;
  }
}

// ============================================================================
// Formatter
// ============================================================================

const META_ATTACH_FLAG = '^';
const META_GLUE_FLAG = '&';
const META_START = '{';
const META_END = '}';
const META_ESCAPE = '\\';
const META_ESC_START = META_ESCAPE + META_START;
const META_ESC_END = META_ESCAPE + META_END;
const ATOM_PATTERN = /(?:\\{|\\}|[^{}])+|{(?:\\{|\\}|[^{}])*}/g;

function createAction(init?: Partial<FormattingAction>): FormattingAction {
  return {
    prevAttach: false,
    prevReplace: '',
    text: null,
    nextAttach: false,
    nextCase: null,
    spaceChar: ' ',
    glue: false,
    combo: null,
    command: null,
    ...init,
  };
}

function parseMeta(meta: string): [string | null, string | null] {
  let match = meta.match(/^PLOVER:(.*)$/i);
  if (match) return ['command', match[1]];

  match = meta.match(/^#(.*)$/);
  if (match) return ['key_combo', match[1]];

  if (/^[,:;]$/.test(meta)) return ['comma', meta];
  if (/^[.!?]$/.test(meta)) return ['stop', meta];
  if (meta === '-|') return ['case', 'cap_first_word'];
  if (meta === '>') return ['case', 'lower_first_char'];
  if (meta === '<') return ['case', 'upper_first_word'];

  if (meta.startsWith(META_GLUE_FLAG)) return ['glue', meta.slice(1)];
  if (meta.startsWith(META_ATTACH_FLAG) || meta.endsWith(META_ATTACH_FLAG)) {
    return ['attach', meta];
  }

  return [null, null];
}

function applyCase(text: string, caseMode: string | null): string {
  if (caseMode === null) return text;
  switch (caseMode) {
    case 'cap_first_word':
      return text.charAt(0).toUpperCase() + text.slice(1);
    case 'lower_first_char':
      return text.charAt(0).toLowerCase() + text.slice(1);
    case 'upper_first_word':
      const match = text.match(/\S+/);
      if (!match) return text;
      return match[0].toUpperCase() + text.slice(match[0].length);
    case 'lower':
      return text.toLowerCase();
    case 'upper':
      return text.toUpperCase();
    default:
      return text;
  }
}

class Formatter {
  startAttached = true;
  startCapitalized = false;
  spaceChar = ' ';

  private lastAction(prev: Translation[] | null): FormattingAction {
    if (prev && prev.length > 0) {
      const lastTrans = prev[prev.length - 1];
      if (lastTrans.formatting.length > 0) {
        return lastTrans.formatting[lastTrans.formatting.length - 1];
      }
    }
    return createAction({
      nextAttach: this.startAttached,
      nextCase: this.startCapitalized ? 'cap_first_word' : null,
      spaceChar: this.spaceChar,
    });
  }

  format(
    undo: Translation[],
    doTranslations: Translation[],
    prev: Translation[] | null,
    output: {
      sendBackspaces: (count: number) => void;
      sendString: (text: string) => void;
      sendKeyCombination: (combo: string) => void;
      sendEngineCommand: (command: string) => void;
    }
  ): void {
    const newActions: FormattingAction[] = [];

    if (doTranslations.length > 0) {
      let lastAct = this.lastAction(prev);

      for (const t of doTranslations) {
        t.formatting = t.english
          ? this.translationToActions(t.english, lastAct)
          : this.rawToActions(t.rtfcre[0], lastAct);
        newActions.push(...t.formatting);
        if (t.formatting.length > 0) {
          lastAct = t.formatting[t.formatting.length - 1];
        }
      }
    }

    const oldActions: FormattingAction[] = [];
    for (const t of undo) {
      oldActions.push(...t.formatting);
    }

    // Calculate backspaces needed
    let removeCount = 0;
    for (const action of oldActions) {
      if (action.text) {
        removeCount += action.text.length;
        if (!action.prevAttach) {
          removeCount += action.spaceChar.length;
        }
      }
    }

    if (removeCount > 0) {
      output.sendBackspaces(removeCount);
    }

    // Output new text
    for (const action of newActions) {
      if (action.combo) {
        output.sendKeyCombination(action.combo);
      } else if (action.command) {
        output.sendEngineCommand(action.command);
      } else if (action.text !== null) {
        let text = '';
        if (!action.prevAttach) {
          text += action.spaceChar;
        }
        text += action.text;
        output.sendString(text);
      }
    }
  }

  private translationToActions(translation: string, lastAct: FormattingAction): FormattingAction[] {
    if (/^\d+$/.test(translation)) {
      translation = `{${META_GLUE_FLAG}${translation}}`;
    }

    const atoms = (translation.match(ATOM_PATTERN) ?? [])
      .map(x => x.trim())
      .filter(x => x.length > 0);

    const actionList: FormattingAction[] = [];
    let currentLastAct = lastAct;

    for (const atom of atoms) {
      const action = this.atomToAction(atom, currentLastAct);
      actionList.push(action);
      currentLastAct = action;
    }

    if (actionList.length === 0) {
      actionList.push(createAction({
        prevAttach: lastAct.nextAttach,
        spaceChar: lastAct.spaceChar,
        nextAttach: lastAct.nextAttach,
        nextCase: lastAct.nextCase,
      }));
    }

    return actionList;
  }

  private rawToActions(stroke: string, lastAct: FormattingAction): FormattingAction[] {
    const noDash = stroke.replace('-', '');
    if (/^\d+$/.test(noDash)) {
      return this.translationToActions(noDash, lastAct);
    }

    return [createAction({
      text: stroke,
      prevAttach: lastAct.nextAttach,
      spaceChar: lastAct.spaceChar,
    })];
  }

  private atomToAction(atom: string, lastAct: FormattingAction): FormattingAction {
    if (atom.startsWith(META_START) && atom.endsWith(META_END)) {
      return this.metaToAction(atom.slice(1, -1), lastAct);
    }

    const text = atom
      .replace(META_ESC_START, META_START)
      .replace(META_ESC_END, META_END);

    return createAction({
      text: applyCase(text, lastAct.nextCase),
      prevAttach: lastAct.nextAttach,
      spaceChar: lastAct.spaceChar,
    });
  }

  private metaToAction(meta: string, lastAct: FormattingAction): FormattingAction {
    const [metaName, metaArg] = parseMeta(meta);

    const action = createAction({
      prevAttach: lastAct.nextAttach,
      spaceChar: lastAct.spaceChar,
    });

    if (metaName === 'attach' && metaArg) {
      const text = metaArg
        .replace(META_ESC_START, META_START)
        .replace(META_ESC_END, META_END);
      
      const startsWithCaret = text.startsWith(META_ATTACH_FLAG);
      const endsWithCaret = text.endsWith(META_ATTACH_FLAG);
      
      let cleanText = text;
      if (startsWithCaret) cleanText = cleanText.slice(1);
      if (endsWithCaret) cleanText = cleanText.slice(0, -1);
      
      action.text = applyCase(cleanText, lastAct.nextCase);
      action.prevAttach = startsWithCaret || lastAct.nextAttach;
      action.nextAttach = endsWithCaret;
    } else if (metaName === 'glue' && metaArg) {
      action.text = applyCase(metaArg, lastAct.nextCase);
      action.glue = true;
      action.prevAttach = lastAct.glue || lastAct.nextAttach;
      action.nextAttach = true;
    } else if (metaName === 'comma' && metaArg) {
      action.text = metaArg;
      action.prevAttach = true;
    } else if (metaName === 'stop' && metaArg) {
      action.text = metaArg;
      action.prevAttach = true;
      action.nextCase = 'cap_first_word';
    } else if (metaName === 'case' && metaArg) {
      action.nextCase = metaArg;
    } else if (metaName === 'key_combo' && metaArg) {
      action.combo = metaArg;
    } else if (metaName === 'command' && metaArg) {
      action.command = metaArg;
    }

    return action;
  }
}

// ============================================================================
// Output Handler
// ============================================================================

class TranslationOutputHandler {
  private engine: StenoEngine;
  private currentText = '';
  private outputElements: OutputElement[] = [];

  constructor(engine: StenoEngine) {
    this.engine = engine;
  }

  resetAll(): void {
    this.currentText = '';
    this.outputElements = [];
  }

  resetStrokeOutput(): void {
    this.outputElements = [];
  }

  sendBackspaces(count: number): void {
    if (count > 0) {
      this.currentText = this.currentText.slice(0, -count);
    }
  }

  sendString(text: string): void {
    this.currentText += text;
  }

  sendKeyCombination(combo: string): void {
    if (this.currentText) {
      this.outputElements.push({
        type: 'committed',
        text: this.currentText,
      });
      this.currentText = '';
    }

    this.outputElements.push({
      type: 'keypress',
      combo,
    });
  }

  sendEngineCommand(command: string): void {
    this.engine.handleEngineCommand(command);
  }

  getOutputElements(): OutputElement[] {
    const elements = [...this.outputElements];

    if (this.currentText) {
      elements.push({
        type: 'preedit',
        text: this.currentText,
      });
    }

    return elements;
  }

  getCurrentText(): string {
    return this.currentText;
  }
}

// ============================================================================
// Main Engine
// ============================================================================

export class StenoEngine {
  private dictionaries: StenoDictionaryCollection;
  private translator: Translator;
  private formatter: Formatter;
  private output: TranslationOutputHandler;
  private startingStrokeState: StartingStrokeState;
  private strokeListeners: Set<(stroke: Stroke, output: OutputElement[]) => void> = new Set();

  constructor() {
    this.dictionaries = new StenoDictionaryCollection();
    this.translator = new Translator();
    this.formatter = new Formatter();
    this.output = new TranslationOutputHandler(this);

    this.startingStrokeState = {
      attach: true,
      capitalize: false,
      spaceChar: ' ',
    };

    this.applyStartingStrokeState();
    this.translator.setDictionary(this.dictionaries);
    this.translator.addListener((undo, doTrans, prev) => {
      this.formatter.format(undo, doTrans, prev, {
        sendBackspaces: (count) => this.output.sendBackspaces(count),
        sendString: (text) => this.output.sendString(text),
        sendKeyCombination: (combo) => this.output.sendKeyCombination(combo),
        sendEngineCommand: (command) => this.output.sendEngineCommand(command),
      });
    });
  }

  private applyStartingStrokeState(): void {
    this.formatter.startAttached = this.startingStrokeState.attach;
    this.formatter.startCapitalized = this.startingStrokeState.capitalize;
    this.formatter.spaceChar = this.startingStrokeState.spaceChar;
  }

  addStrokeListener(callback: (stroke: Stroke, output: OutputElement[]) => void): void {
    this.strokeListeners.add(callback);
  }

  removeStrokeListener(callback: (stroke: Stroke, output: OutputElement[]) => void): void {
    this.strokeListeners.delete(callback);
  }

  async processStroke(strokeStr: string): Promise<OutputElement[]> {
    this.output.resetStrokeOutput();
    
    const stroke = Stroke.fromSteno(strokeStr);
    await this.translator.translate(stroke);

    const elements = this.output.getOutputElements();

    for (const listener of this.strokeListeners) {
      listener(stroke, elements);
    }

    return elements;
  }

  async processStrokeFromKeys(keys: string[]): Promise<OutputElement[]> {
    const stroke = Stroke.fromKeys(keys);
    return this.processStroke(stroke.rtfcre);
  }

  getCurrentText(): string {
    return this.output.getCurrentText();
  }

  resetState(): void {
    this.translator.clearState();
    this.output.resetAll();
    this.applyStartingStrokeState();
  }

  handleEngineCommand(command: string): void {
    console.log('Engine command:', command);
  }

  setStartingStrokeState(state: Partial<StartingStrokeState>): StartingStrokeState {
    this.startingStrokeState = { ...this.startingStrokeState, ...state };
    this.applyStartingStrokeState();
    return this.startingStrokeState;
  }

  getStartingStrokeState(): StartingStrokeState {
    return { ...this.startingStrokeState };
  }

  // Dictionary Management
  importDictionary(name: string, data: Record<string, string>, merge = false): DictionaryInfo {
    let dictionary = this.dictionaries.get(name);
    
    if (!dictionary) {
      dictionary = new StenoDictionary({ path: name });
      this.dictionaries.setDicts([...this.dictionaries.dicts, dictionary]);
    } else if (dictionary.readonly) {
      throw new Error(`Dictionary is read-only: ${name}`);
    }

    if (!merge) {
      dictionary.clear();
    }

    const entries: Array<[string[], string]> = [];
    for (const [stroke, translation] of Object.entries(data)) {
      const strokeTuple = normalizeSteno(stroke, false);
      entries.push([strokeTuple, translation]);
    }
    dictionary.update(entries);

    return {
      path: name,
      enabled: dictionary.enabled,
      readonly: dictionary.readonly,
      entries: dictionary.length,
    };
  }

  exportDictionary(name: string): Record<string, string> {
    const dictionary = this.dictionaries.get(name);
    if (!dictionary) {
      throw new Error(`Dictionary not found: ${name}`);
    }

    const data: Record<string, string> = {};
    for (const [strokeTuple, translation] of dictionary.items()) {
      data[strokeTuple.join('/')] = translation;
    }
    return data;
  }

  removeDictionary(name: string): void {
    const dicts = this.dictionaries.dicts.filter(d => d.path !== name);
    if (dicts.length === this.dictionaries.dicts.length) {
      throw new Error(`Dictionary not found: ${name}`);
    }
    this.dictionaries.setDicts(dicts);
  }

  listDictionaries(): DictionaryInfo[] {
    return this.dictionaries.dicts.map(d => ({
      path: d.path,
      enabled: d.enabled,
      readonly: d.readonly,
      entries: d.length,
    }));
  }

  setDictionaryEnabled(name: string, enabled: boolean): void {
    const dict = this.dictionaries.dicts.find(d => d.path === name);
    if (!dict) {
      throw new Error(`Dictionary not found: ${name}`);
    }
    dict.enabled = enabled;
  }

  prioritizeDictionaries(names: string[]): void {
    const dicts = [...this.dictionaries.dicts];
    for (let i = names.length - 1; i >= 0; i--) {
      const idx = dicts.findIndex(d => d.path === names[i] || d.path.endsWith('/' + names[i]));
      if (idx !== -1) {
        const [dict] = dicts.splice(idx, 1);
        dicts.unshift(dict);
      }
    }
    this.dictionaries.setDicts(dicts);
  }

  addEntry(stroke: string, translation: string, dictionaryName?: string): void {
    const strokeTuple = normalizeSteno(stroke, false);
    const dictionary = dictionaryName 
      ? this.dictionaries.get(dictionaryName)
      : this.dictionaries.firstWritable();

    if (!dictionary) {
      throw new Error(dictionaryName ? `Dictionary not found: ${dictionaryName}` : 'No writable dictionary');
    }

    if (dictionary.readonly) {
      throw new Error(`Dictionary is read-only: ${dictionary.path}`);
    }

    dictionary.set(strokeTuple, translation);
  }

  removeEntry(stroke: string, dictionaryName?: string): void {
    const strokeTuple = normalizeSteno(stroke, false);

    if (dictionaryName) {
      const dictionary = this.dictionaries.get(dictionaryName);
      if (!dictionary) throw new Error(`Dictionary not found: ${dictionaryName}`);
      if (dictionary.readonly) throw new Error(`Dictionary is read-only: ${dictionaryName}`);
      if (!dictionary.has(strokeTuple)) throw new Error(`Entry not found: ${stroke}`);
      dictionary.delete(strokeTuple);
    } else {
      for (const dictionary of this.dictionaries.dicts) {
        if (dictionary.has(strokeTuple) && !dictionary.readonly) {
          dictionary.delete(strokeTuple);
          return;
        }
      }
      throw new Error(`Entry not found or all dictionaries are read-only: ${stroke}`);
    }
  }

  updateEntry(stroke: string, translation: string, dictionaryName?: string): void {
    this.addEntry(stroke, translation, dictionaryName);
  }

  async lookup(stroke: string): Promise<string | null> {
    const strokeTuple = normalizeSteno(stroke, false);
    return this.dictionaries.lookup(strokeTuple);
  }

  async reverseLookup(translation: string): Promise<string[]> {
    const strokes = await this.dictionaries.reverseLookup(translation);
    return [...strokes].map(s => s.join('/'));
  }

  getDictionaryEntries(name: string): Array<{ stroke: string; translation: string }> {
    const dictionary = this.dictionaries.get(name);
    if (!dictionary) {
      throw new Error(`Dictionary not found: ${name}`);
    }

    return dictionary.items().map(([strokeTuple, translation]) => ({
      stroke: strokeTuple.join('/'),
      translation,
    }));
  }
}

// Create singleton instance
export const stenoEngine = new StenoEngine();

// Expose globally for testing
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).stenoEngine = stenoEngine;
  (window as unknown as Record<string, unknown>).Stroke = Stroke;
}
