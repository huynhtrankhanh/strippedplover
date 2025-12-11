/**
 * Stripped Plover - STDIO-based Stenography Translation Engine
 * 
 * This module implements the main engine that communicates via JSON line protocol.
 */

import { Stroke, normalizeSteno } from './stroke.js';
import { StenoDictionary, StenoDictionaryCollection, loadDictionary } from './dictionary/index.js';
import { Translator, Translation } from './translation.js';
import { Formatter, Action, Case } from './formatting.js';
import * as system from './system/index.js';
import { registry } from './registry.js';
import { registerMetas } from './meta/index.js';
import { registerMacros } from './macro/index.js';

// ============================================================================
// Types
// ============================================================================

export interface StartingStrokeState {
  attach: boolean;
  capitalize: boolean;
  spaceChar: string;
}

export interface OutputElement {
  type: 'committed' | 'keypress' | 'preedit';
  text?: string;
  combo?: string;
}

export interface ProtocolRequest {
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface ProtocolResponse {
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

// Error codes
const ErrorCodes = {
  PARSE_ERROR: -32700,
  UNKNOWN_METHOD: -32601,
  GENERAL_ERROR: -32000,
};

// ============================================================================
// Output Handler
// ============================================================================

class TranslationOutputHandler {
  private engine: StrippedPlover;
  private currentText = '';
  private outputElements: OutputElement[] = [];
  private isInitial = true;

  constructor(engine: StrippedPlover) {
    this.engine = engine;
  }

  resetAll(): void {
    this.currentText = '';
    this.outputElements = [];
    this.isInitial = true;
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
    // Commit any pending preedit before keypress
    if (this.currentText) {
      this.outputElements.push({
        type: 'committed',
        text: this.currentText,
      });
      this.currentText = '';
      this.isInitial = false;
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

  getIsInitial(): boolean {
    return this.isInitial;
  }

  markNotInitial(): void {
    this.isInitial = false;
  }
}

// ============================================================================
// Main Engine
// ============================================================================

export class StrippedPlover {
  private dictionaries: StenoDictionaryCollection;
  private translator: Translator;
  private formatter: Formatter;
  private output: TranslationOutputHandler;
  private startingStrokeState: StartingStrokeState;

  // Commands that are not supported
  private static UNSUPPORTED_COMMANDS = new Set(['toggle', 'stop', 'resume', 'suspend', 'quit']);

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

    // Setup system
    this.setupSystem();

    // Apply initial state
    this.applyStartingStrokeState();

    // Connect translator to formatter
    this.translator.setDictionary(this.dictionaries);
    this.formatter.setOutput({
      sendBackspaces: (count) => this.output.sendBackspaces(count),
      sendString: (text) => this.output.sendString(text),
      sendKeyCombination: (combo) => this.output.sendKeyCombination(combo),
      sendEngineCommand: (command) => this.output.sendEngineCommand(command),
    });
    this.translator.addListener((undo, doTrans, prev) => {
      this.formatter.format(undo, doTrans, prev);
    });
  }

  private setupSystem(): void {
    // Register plugins
    registerMetas();
    registerMacros();
    
    // Setup the steno system
    system.setup('English Stenotype');
  }

  private applyStartingStrokeState(): void {
    this.formatter.startAttached = this.startingStrokeState.attach;
    this.formatter.startCapitalized = this.startingStrokeState.capitalize;
    this.formatter.spaceChar = this.startingStrokeState.spaceChar;
  }

  handleEngineCommand(command: string): void {
    const parts = command.split(':', 2);
    const commandName = parts[0].toLowerCase();

    if (StrippedPlover.UNSUPPORTED_COMMANDS.has(commandName)) {
      return;
    }

    if (commandName === 'set_config' && parts[1]) {
      this.handleSetConfig(parts[1]);
    }
  }

  private handleSetConfig(cmdline: string): void {
    try {
      // Parse the config string - only accept known keys with safe values
      // Format expected: 'start_attached': true, 'start_capitalized': false, 'space_char': ' '
      const parts = cmdline.split(',').map(p => p.trim());
      const config: Record<string, unknown> = {};
      
      for (const part of parts) {
        const match = part.match(/^['"]?(\w+)['"]?\s*:\s*(.+)$/);
        if (match) {
          const key = match[1];
          let value = match[2].trim();
          
          // Only allow known keys
          if (!['start_attached', 'start_capitalized', 'space_char'].includes(key)) {
            continue;
          }
          
          // Parse value safely
          if (value === 'true') {
            config[key] = true;
          } else if (value === 'false') {
            config[key] = false;
          } else if (value.startsWith("'") && value.endsWith("'")) {
            config[key] = value.slice(1, -1);
          } else if (value.startsWith('"') && value.endsWith('"')) {
            config[key] = value.slice(1, -1);
          }
        }
      }

      const attach = config.start_attached ?? this.startingStrokeState.attach;
      const capitalize = config.start_capitalized ?? this.startingStrokeState.capitalize;
      const spaceChar = config.space_char ?? this.startingStrokeState.spaceChar;

      this.startingStrokeState = { 
        attach: Boolean(attach), 
        capitalize: Boolean(capitalize), 
        spaceChar: String(spaceChar) 
      };
      this.applyStartingStrokeState();
    } catch {
      // Invalid syntax, ignore
    }
  }

  handleRequest(request: ProtocolRequest): ProtocolResponse & { quit?: boolean } {
    const requestId = request.id;
    const method = request.method ?? '';
    const params = request.params ?? {};

    try {
      let result: Record<string, unknown>;

      switch (method) {
        case 'translate':
          result = this.translate(params);
          break;
        case 'reset_state':
          result = this.resetState();
          break;
        case 'set_starting_stroke_state':
          result = this.setStartingStrokeState(params);
          break;
        case 'get_starting_stroke_state':
          result = this.getStartingStrokeState();
          break;
        case 'add_dictionary':
          result = this.addDictionary(params);
          break;
        case 'remove_dictionary':
          result = this.removeDictionary(params);
          break;
        case 'add_entry':
          result = this.addEntry(params);
          break;
        case 'remove_entry':
          result = this.removeEntry(params);
          break;
        case 'update_entry':
          result = this.updateEntry(params);
          break;
        case 'lookup':
          result = this.lookup(params);
          break;
        case 'reverse_lookup':
          result = this.reverseLookup(params);
          break;
        case 'list_dictionaries':
          result = this.listDictionaries();
          break;
        case 'get_dictionary_entries':
          result = this.getDictionaryEntries(params);
          break;
        case 'export_dictionary':
          result = this.exportDictionary(params);
          break;
        case 'import_dictionary':
          result = this.importDictionary(params);
          break;
        case 'quit':
          return { id: requestId, result: { status: 'ok' }, quit: true };
        default:
          return {
            id: requestId,
            error: { code: ErrorCodes.UNKNOWN_METHOD, message: `Unknown method: ${method}` },
          };
      }

      return { id: requestId, result };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        id: requestId,
        error: { code: ErrorCodes.GENERAL_ERROR, message },
      };
    }
  }

  private translate(params: Record<string, unknown>): Record<string, unknown> {
    const strokeStr = String(params.stroke ?? '');

    // Reset per-stroke output capture
    this.output.resetStrokeOutput();

    // Create stroke and translate
    const stroke = Stroke.fromSteno(strokeStr);
    this.translator.translate(stroke);

    // Mark not initial if we produced output
    const elements = this.output.getOutputElements();
    if (elements.length > 0) {
      this.output.markNotInitial();
    }

    return { output: elements };
  }

  private resetState(): Record<string, unknown> {
    this.translator.clearState();
    this.output.resetAll();
    this.applyStartingStrokeState();
    return { status: 'ok' };
  }

  private setStartingStrokeState(params: Record<string, unknown>): Record<string, unknown> {
    const attach = params.attach ?? this.startingStrokeState.attach;
    const capitalize = params.capitalize ?? this.startingStrokeState.capitalize;
    const spaceChar = params.space_char ?? this.startingStrokeState.spaceChar;

    this.startingStrokeState = {
      attach: Boolean(attach),
      capitalize: Boolean(capitalize),
      spaceChar: String(spaceChar),
    };
    this.applyStartingStrokeState();

    return {
      status: 'ok',
      attach: this.startingStrokeState.attach,
      capitalize: this.startingStrokeState.capitalize,
      space_char: this.startingStrokeState.spaceChar,
    };
  }

  private getStartingStrokeState(): Record<string, unknown> {
    return {
      attach: this.startingStrokeState.attach,
      capitalize: this.startingStrokeState.capitalize,
      space_char: this.startingStrokeState.spaceChar,
    };
  }

  private addDictionary(params: Record<string, unknown>): Record<string, unknown> {
    const path = params.path as string;
    if (!path) {
      throw new Error('Dictionary path is required');
    }

    const dictionary = loadDictionary(path);
    const dicts = [...this.dictionaries.dicts, dictionary];
    this.dictionaries.setDicts(dicts);

    return { status: 'ok', path, entries: dictionary.length };
  }

  private removeDictionary(params: Record<string, unknown>): Record<string, unknown> {
    const path = params.path as string;
    if (!path) {
      throw new Error('Dictionary path is required');
    }

    const dicts = this.dictionaries.dicts.filter(d => d.path !== path);
    if (dicts.length === this.dictionaries.dicts.length) {
      throw new Error(`Dictionary not found: ${path}`);
    }

    this.dictionaries.setDicts(dicts);
    return { status: 'ok', path };
  }

  private addEntry(params: Record<string, unknown>): Record<string, unknown> {
    const stroke = params.stroke as string;
    const translation = params.translation as string;
    const path = params.path as string | undefined;

    if (!stroke || !translation) {
      throw new Error('Both stroke and translation are required');
    }

    const strokeTuple = normalizeSteno(stroke, false);
    let dictionary: StenoDictionary;

    if (path) {
      const d = this.dictionaries.get(path);
      if (!d) {
        throw new Error(`Dictionary not found: ${path}`);
      }
      dictionary = d;
    } else {
      dictionary = this.dictionaries.firstWritable();
    }

    if (dictionary.readonly) {
      throw new Error(`Dictionary is read-only: ${dictionary.path}`);
    }

    dictionary.set(strokeTuple, translation);

    return { status: 'ok', stroke: strokeTuple.join('/'), translation };
  }

  private removeEntry(params: Record<string, unknown>): Record<string, unknown> {
    const stroke = params.stroke as string;
    const path = params.path as string | undefined;

    if (!stroke) {
      throw new Error('Stroke is required');
    }

    const strokeTuple = normalizeSteno(stroke, false);

    if (path) {
      const dictionary = this.dictionaries.get(path);
      if (!dictionary) {
        throw new Error(`Dictionary not found: ${path}`);
      }
      if (dictionary.readonly) {
        throw new Error(`Dictionary is read-only: ${path}`);
      }
      if (!dictionary.has(strokeTuple)) {
        throw new Error(`Entry not found: ${stroke}`);
      }
      dictionary.delete(strokeTuple);
    } else {
      let found = false;
      for (const dictionary of this.dictionaries.dicts) {
        if (dictionary.has(strokeTuple)) {
          if (dictionary.readonly) continue;
          dictionary.delete(strokeTuple);
          found = true;
          break;
        }
      }
      if (!found) {
        throw new Error(`Entry not found or all dictionaries are read-only: ${stroke}`);
      }
    }

    return { status: 'ok', stroke: strokeTuple.join('/') };
  }

  private updateEntry(params: Record<string, unknown>): Record<string, unknown> {
    const stroke = params.stroke as string;
    const translation = params.translation as string;
    const path = params.path as string | undefined;

    if (!stroke || !translation) {
      throw new Error('Both stroke and translation are required');
    }

    const strokeTuple = normalizeSteno(stroke, false);
    let dictionary: StenoDictionary | null = null;

    if (path) {
      dictionary = this.dictionaries.get(path);
      if (!dictionary) {
        throw new Error(`Dictionary not found: ${path}`);
      }
    } else {
      for (const d of this.dictionaries.dicts) {
        if (d.has(strokeTuple)) {
          dictionary = d;
          break;
        }
      }
      if (!dictionary) {
        throw new Error(`Entry not found: ${stroke}`);
      }
    }

    if (dictionary.readonly) {
      throw new Error(`Dictionary is read-only: ${dictionary.path}`);
    }

    dictionary.set(strokeTuple, translation);

    return { status: 'ok', stroke: strokeTuple.join('/'), translation };
  }

  private lookup(params: Record<string, unknown>): Record<string, unknown> {
    const stroke = params.stroke as string;
    if (!stroke) {
      throw new Error('Stroke is required');
    }

    const strokeTuple = normalizeSteno(stroke, false);
    const translation = this.dictionaries.lookup(strokeTuple);

    return {
      stroke: strokeTuple.join('/'),
      translation,
    };
  }

  private reverseLookup(params: Record<string, unknown>): Record<string, unknown> {
    const translation = params.translation as string;
    if (!translation) {
      throw new Error('Translation is required');
    }

    const strokes = this.dictionaries.reverseLookup(translation);

    return {
      translation,
      strokes: [...strokes].map(s => s.join('/')),
    };
  }

  private listDictionaries(): Record<string, unknown> {
    const dicts = this.dictionaries.dicts.map(d => ({
      path: d.path,
      enabled: d.enabled,
      readonly: d.readonly,
      entries: d.length,
    }));

    return { dictionaries: dicts };
  }

  private getDictionaryEntries(params: Record<string, unknown>): Record<string, unknown> {
    const path = params.path as string;
    if (!path) {
      throw new Error('Dictionary path is required');
    }

    const dictionary = this.dictionaries.get(path);
    if (!dictionary) {
      throw new Error(`Dictionary not found: ${path}`);
    }

    const entries = dictionary.items().map(([strokeTuple, translation]) => ({
      stroke: strokeTuple.join('/'),
      translation,
    }));

    return { path, entries };
  }

  /**
   * Export a dictionary - dumps entries to output as a protocol message
   */
  private exportDictionary(params: Record<string, unknown>): Record<string, unknown> {
    const path = params.path as string;
    if (!path) {
      throw new Error('Dictionary path is required');
    }

    const dictionary = this.dictionaries.get(path);
    if (!dictionary) {
      throw new Error(`Dictionary not found: ${path}`);
    }

    // Export as JSON object
    const data: Record<string, string> = {};
    for (const [strokeTuple, translation] of dictionary.items()) {
      data[strokeTuple.join('/')] = translation;
    }

    return {
      status: 'ok',
      path,
      format: 'json',
      data,
    };
  }

  /**
   * Import a dictionary - reads entries from the request
   */
  private importDictionary(params: Record<string, unknown>): Record<string, unknown> {
    const path = params.path as string;
    const data = params.data as Record<string, string>;
    const merge = params.merge as boolean ?? false;

    if (!path) {
      throw new Error('Dictionary path is required');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Dictionary data is required');
    }

    let dictionary = this.dictionaries.get(path);
    
    if (!dictionary) {
      // Create a new dictionary
      dictionary = new StenoDictionary({ path });
      const dicts = [...this.dictionaries.dicts, dictionary];
      this.dictionaries.setDicts(dicts);
    } else if (dictionary.readonly) {
      throw new Error(`Dictionary is read-only: ${path}`);
    }

    if (!merge) {
      dictionary.clear();
    }

    // Import entries
    const entries: Array<[string[], string]> = [];
    for (const [stroke, translation] of Object.entries(data)) {
      const strokeTuple = normalizeSteno(stroke, false);
      entries.push([strokeTuple, translation]);
    }
    dictionary.update(entries);

    return {
      status: 'ok',
      path,
      entries: dictionary.length,
    };
  }
}
