/**
 * Stripped Plover - STDIO-based Stenography Translation Engine
 * 
 * This module implements the main engine that communicates via JSON line protocol.
 */

import { DatabaseSync } from './lmdb-database.js';
import { Stroke, normalizeSteno } from './stroke.js';
import { StenoDictionary, StenoDictionaryCollection, StenoDictionaryLike, createJsonDictionary, createPythonDictionary, PythonDictionary, DictionaryType } from './dictionary/index.js';
import { Translator, Translation } from './translation.js';
import { Formatter, Action, Case } from './formatting.js';
import * as system from './system/index.js';
import { registry } from './registry.js';
import { registerMetas } from './meta/index.js';
import { registerMacros } from './macro/index.js';
import { Rope } from './utils/rope.js';

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
  private currentText: Rope = new Rope();
  private outputElements: OutputElement[] = [];
  private isInitial = true;
  private history: Rope[] = [this.currentText];

  constructor(engine: StrippedPlover) {
    this.engine = engine;
  }

  resetAll(): void {
    this.currentText = new Rope();
    this.history = [this.currentText];
    this.outputElements = [];
    this.isInitial = true;
  }

  resetStrokeOutput(): void {
    this.outputElements = [];
  }

  trimHistory(count: number): void {
    while (count > 0 && this.history.length > 1) {
      this.history.pop();
      count--;
    }
  }

  recordCurrent(): void {
    const last = this.history[this.history.length - 1];
    if (last !== this.currentText) {
      this.history.push(this.currentText);
    }
  }

  sendBackspaces(count: number): void {
    if (count <= 0) return;
    const len = this.currentText.length;
    if (len === 0) return;
    const remove = Math.min(len, count);
    this.currentText = this.currentText.delete(len - remove, len);
  }

  sendString(text: string): void {
    if (!text) return;
    this.currentText = this.currentText.append(text);
  }

  sendKeyCombination(combo: string): void {
    // Commit any pending preedit before keypress
    const pending = this.currentText.toString();
    if (pending) {
      this.outputElements.push({
        type: 'committed',
        text: pending,
      });
      this.currentText = new Rope();
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
    const currentText = this.currentText.toString();

    if (currentText) {
      elements.push({
        type: 'preedit',
        text: currentText,
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
  private soloEnabled: boolean;
  private soloPreviousEnabled: Map<string, boolean>;
  private soloHasRun: boolean;
  private eventSink: ((event: Record<string, unknown>) => void) | null;
  private db!: DatabaseSync;
  private loadPromise: Promise<void>;

  // Commands that are not supported
  private static UNSUPPORTED_COMMANDS = new Set(['toggle', 'stop', 'resume', 'suspend', 'quit']);

  constructor(databasePath: string) {
    this.initDatabase(databasePath);
    this.dictionaries = new StenoDictionaryCollection();
    this.loadPromise = this.loadDictionaries();

    this.translator = new Translator();
    this.formatter = new Formatter();
    this.output = new TranslationOutputHandler(this);

    this.soloEnabled = false;
    this.soloPreviousEnabled = new Map();
    this.soloHasRun = false;
    this.eventSink = (event) => {
      // Emit protocol events to STDOUT by default
      console.log(JSON.stringify(event));
    };

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
      trimHistory: (count) => this.output.trimHistory(count),
      recordCurrent: () => this.output.recordCurrent(),
    });
    this.translator.addListener((undo, doTrans, prev) => {
      this.formatter.format(undo, doTrans, prev);
    });
  }

  private initDatabase(path: string): void {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dictionaries (
        name TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        readonly BOOLEAN DEFAULT 0,
        priority INTEGER,
        python_code TEXT
      );
      CREATE TABLE IF NOT EXISTS entries (
        dictionary TEXT,
        stroke TEXT,
        translation TEXT,
        PRIMARY KEY (dictionary, stroke),
        FOREIGN KEY (dictionary) REFERENCES dictionaries(name) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_translation ON entries(translation);
      CREATE INDEX IF NOT EXISTS idx_dictionary ON entries(dictionary);
    `);
  }

  private async loadDictionaries(): Promise<void> {
    const stmt = this.db.prepare('SELECT * FROM dictionaries ORDER BY priority DESC');
    const rows = stmt.all() as Array<{
      name: string;
      type: string;
      enabled: number;
      readonly: number;
      python_code: string | null;
    }>;

    const dicts: StenoDictionaryLike[] = [];

    for (const row of rows) {
      if (row.type === 'json') {
        const dict = new StenoDictionary(this.db, {
          identifier: row.name,
          enabled: Boolean(row.enabled),
          readonly: Boolean(row.readonly),
        });
        dicts.push(dict);
      } else if (row.type === 'python' && row.python_code) {
        try {
          const dict = await createPythonDictionary(row.name, row.python_code);
          dict.enabled = Boolean(row.enabled);
          // Python dictionaries are always readonly
          dicts.push(dict);
        } catch (e) {
          console.error(`Failed to load python dictionary ${row.name}:`, e);
        }
      }
    }

    this.dictionaries.setDicts(dicts);
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
    const parts = command.split(':');
    const commandName = parts[0].toLowerCase();
    const cmdline = parts.slice(1).join(':');

    if (!commandName) {
      return;
    }

    if (StrippedPlover.UNSUPPORTED_COMMANDS.has(commandName)) {
      return;
    }

    try {
      if (commandName === 'set_config' && cmdline) {
        this.handleSetConfig(cmdline);
      } else if (commandName === 'priority_dict') {
        this.handlePriorityDict(this.parseSelectionList(cmdline));
        this.emitDictionaryStateEvent();
      } else if (commandName === 'toggle_dict') {
        this.handleToggleDict(this.parseSelectionList(cmdline));
        this.emitDictionaryStateEvent();
      } else if (commandName === 'solo_dict') {
        this.handleSoloDict(this.parseSelectionList(cmdline));
        this.emitDictionaryStateEvent();
      } else if (commandName === 'end_solo_dict') {
        this.handleEndSoloDict();
        this.emitDictionaryStateEvent();
      }
    } catch (e) {
      console.warn('Failed to handle engine command:', command, e);
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
    } catch (err) {
      console.error('Failed to parse set_config command:', err);
    }
  }

  private parseSelectionList(cmdline: string): string[] {
    if (!cmdline) return [];
    return cmdline
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  private findDictionaryIndex(identifier: string, dicts: StenoDictionaryLike[] = this.dictionaries.dicts): number {
    const targetSuffix = `/${identifier}`;

    const matches: Array<{ index: number; length: number }> = [];
    const normalizedDicts = dicts.map((dict, index) => ({
      index,
      identifier: dict.identifier,
    }));

    for (const { index, identifier: candidateIdentifier } of normalizedDicts) {
      const candidate = `/${candidateIdentifier}`;
      if (candidate === targetSuffix || candidate.endsWith(targetSuffix)) {
        matches.push({ index, length: candidateIdentifier.length });
      }
    }

    if (matches.length === 0) {
      throw new Error(`Dictionary not found: ${identifier}`);
    }

    // Prefer the shortest matching identifier; if there is a tie, keep the earliest dictionary order.
    matches.sort((a, b) => (a.length === b.length ? a.index - b.index : a.length - b.length));
    return matches[0].index;
  }

  private reprioritize(identifiers: string[], dicts: StenoDictionaryLike[] = this.dictionaries.dicts): StenoDictionaryLike[] {
    const working = [...dicts];
    for (let i = identifiers.length - 1; i >= 0; i--) {
      const idx = this.findDictionaryIndex(identifiers[i], working);
      const [dict] = working.splice(idx, 1);
      working.unshift(dict);
    }
    return working;
  }

  private applyToggleSpecs(toggles: string[], dicts: StenoDictionaryLike[] = this.dictionaries.dicts): StenoDictionaryLike[] {
    const working = [...dicts];
    for (const spec of toggles) {
      const trimmed = spec.trim();
      if (trimmed.length === 0) continue;

      const action = trimmed.charAt(0);
      const identifier = trimmed.slice(1).trim();

      if (!['+', '-', '!'].includes(action) || !identifier) {
        throw new Error(`Invalid dictionary toggle: ${spec}`);
      }

      const idx = this.findDictionaryIndex(identifier, working);
      const dict = working[idx];

      if (action === '+') {
        dict.enabled = true;
      } else if (action === '-') {
        dict.enabled = false;
      } else {
        dict.enabled = !dict.enabled;
      }
    }
    return working;
  }

  private describeDictionaries(): Array<{ identifier: string; enabled: boolean; readonly: boolean; entries: number }> {
    return this.dictionaries.dicts.map(d => ({
      identifier: d.identifier,
      enabled: d.enabled,
      readonly: d.readonly,
      entries: d.length,
    }));
  }

  private emitDictionaryStateEvent(): void {
    if (!this.eventSink) return;
    try {
      this.eventSink({
        event: 'dictionary_state',
        dictionaries: this.describeDictionaries(),
        solo: this.soloEnabled,
      });
    } catch (err) {
      console.error('Error emitting dictionary_state event:', err);
    }
  }

  private updateDictionaryPriorityInDb(): void {
    const stmt = this.db.prepare('UPDATE dictionaries SET priority = ? WHERE name = ?');
    // We want the first dictionary in the array to have the highest priority number
    const total = this.dictionaries.dicts.length;
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.dictionaries.dicts.forEach((d, i) => {
        // Higher priority value = searched earlier
        // In the collection array, index 0 is high priority.
        // So we can use (total - i) as priority.
        stmt.run(total - i, d.identifier);
      });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      console.error('Failed to update dictionary priorities:', e);
    }
  }

  private updateDictionaryEnabledInDb(identifier: string, enabled: boolean): void {
    const stmt = this.db.prepare('UPDATE dictionaries SET enabled = ? WHERE name = ?');
    stmt.run(enabled ? 1 : 0, identifier);
  }

  private handlePriorityDict(identifiers: string[]): void {
    if (identifiers.length === 0) return;
    const updated = this.reprioritize(identifiers);
    this.dictionaries.setDicts(updated);
    this.updateDictionaryPriorityInDb();
  }

  private handleToggleDict(toggles: string[]): void {
    if (toggles.length === 0) return;
    const updated = this.applyToggleSpecs(toggles);
    this.dictionaries.setDicts(updated);

    // Update all modified dictionaries in DB
    this.db.exec('BEGIN TRANSACTION');
    try {
      const stmt = this.db.prepare('UPDATE dictionaries SET enabled = ? WHERE name = ?');
      for (const dict of updated) {
        stmt.run(dict.enabled ? 1 : 0, dict.identifier);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      console.error('Failed to update enabled state:', e);
    }
  }

  private handleSoloDict(toggles: string[]): void {
    if (!this.soloEnabled) {
      this.soloPreviousEnabled = new Map(this.dictionaries.dicts.map(d => [d.identifier, d.enabled]));
      for (const dict of this.dictionaries.dicts) {
        dict.enabled = false;
      }
      this.soloEnabled = true;
      this.soloHasRun = true;
    }

    const updated = this.applyToggleSpecs(toggles);
    this.dictionaries.setDicts(updated);
    // Note: Solo mode is temporary, we do NOT persist changes to DB.
  }

  private handleEndSoloDict(): void {
    if (!this.soloHasRun) {
      return;
    }

    if (this.soloPreviousEnabled.size > 0) {
      const restored = [...this.dictionaries.dicts];
      for (const dict of restored) {
        const previous = this.soloPreviousEnabled.get(dict.identifier);
        if (previous !== undefined) {
          dict.enabled = previous;
        }
      }
      this.dictionaries.setDicts(restored);
    }

    this.soloEnabled = false;
    this.soloHasRun = false;
    this.soloPreviousEnabled = new Map();
  }

  private parseSelectionParam(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(v => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return this.parseSelectionList(value);
    }
    return [];
  }

  async handleRequest(request: ProtocolRequest): Promise<ProtocolResponse & { quit?: boolean }> {
    const requestId = request.id;
    const method = request.method ?? '';
    const params = request.params ?? {};

    await this.loadPromise;

    try {
      let result: Record<string, unknown>;

      switch (method) {
        case 'translate':
          result = await this.translate(params);
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
        case 'prioritize_dictionaries':
          result = this.prioritizeDictionariesRpc(params);
          break;
        case 'set_dictionary_enabled':
          result = this.setDictionaryEnabled(params);
          break;
        case 'toggle_dictionaries':
          result = this.toggleDictionariesRpc(params);
          break;
        case 'solo_dictionaries':
          result = this.soloDictionariesRpc(params);
          break;
        case 'end_solo_dictionaries':
          result = this.endSoloDictionariesRpc();
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
          result = await this.lookup(params);
          break;
        case 'reverse_lookup':
          result = await this.reverseLookup(params);
          break;
        case 'list_dictionaries':
          result = this.listDictionaries();
          break;
        case 'get_dictionary_state':
          result = this.getDictionaryState();
          break;
        case 'get_dictionary_entries':
          result = this.getDictionaryEntries(params);
          break;
        case 'enumerate_entries':
          result = this.enumerateEntries(params);
          break;
        case 'search_entries':
          result = this.searchEntries(params);
          break;
        case 'export_dictionary':
          result = this.exportDictionary(params);
          break;
        case 'import_dictionary':
          result = await this.importDictionary(params);
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

  private async translate(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const strokeStr = String(params.stroke ?? '');

    // Reset per-stroke output capture
    this.output.resetStrokeOutput();

    // Create stroke and translate
    const stroke = Stroke.fromSteno(strokeStr);
    await this.translator.translate(stroke);

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

  private prioritizeDictionariesRpc(params: Record<string, unknown>): Record<string, unknown> {
    const { identifiers } = params as { identifiers?: unknown };
    const parsed = this.parseSelectionParam(identifiers);
    if (parsed.length === 0) {
      throw new Error('Dictionary identifiers are required');
    }

    this.handlePriorityDict(parsed);
    return { status: 'ok', dictionaries: this.describeDictionaries() };
  }

  private setDictionaryEnabled(params: Record<string, unknown>): Record<string, unknown> {
    const { identifier, enabled } = params as { identifier?: string; enabled?: unknown };

    if (!identifier) {
      throw new Error('Dictionary identifier is required');
    }
    if (typeof enabled !== 'boolean') {
      throw new Error('Enabled flag must be a boolean');
    }

    const dicts = [...this.dictionaries.dicts];
    const idx = this.findDictionaryIndex(identifier, dicts);
    dicts[idx].enabled = enabled;
    this.dictionaries.setDicts(dicts);

    this.updateDictionaryEnabledInDb(dicts[idx].identifier, enabled);

    return { status: 'ok', identifier: dicts[idx].identifier, enabled };
  }

  private toggleDictionariesRpc(params: Record<string, unknown>): Record<string, unknown> {
    const { toggles } = params as { toggles?: unknown };
    const parsed = this.parseSelectionParam(toggles);
    if (parsed.length === 0) {
      throw new Error('Dictionary toggles are required');
    }

    this.handleToggleDict(parsed);
    return { status: 'ok', dictionaries: this.describeDictionaries() };
  }

  private soloDictionariesRpc(params: Record<string, unknown>): Record<string, unknown> {
    const { toggles } = params as { toggles?: unknown };
    const parsed = this.parseSelectionParam(toggles);
    this.handleSoloDict(parsed);
    return { status: 'ok', dictionaries: this.describeDictionaries(), solo: true };
  }

  private endSoloDictionariesRpc(): Record<string, unknown> {
    this.handleEndSoloDict();
    return { status: 'ok', dictionaries: this.describeDictionaries(), solo: false };
  }

  private removeDictionary(params: Record<string, unknown>): Record<string, unknown> {
    const name = params.name as string;
    if (!name) {
      throw new Error('Dictionary name is required');
    }

    const dicts = this.dictionaries.dicts.filter(d => d.identifier !== name);
    if (dicts.length === this.dictionaries.dicts.length) {
      throw new Error(`Dictionary not found: ${name}`);
    }

    this.dictionaries.setDicts(dicts);

    // Remove from DB
    const stmt = this.db.prepare('DELETE FROM dictionaries WHERE name = ?');
    stmt.run(name);

    // Note: ON DELETE CASCADE on foreign key should handle entries removal

    return { status: 'ok', name };
  }

  private addEntry(params: Record<string, unknown>): Record<string, unknown> {
    const stroke = params.stroke as string;
    const translation = params.translation as string;
    const name = params.name as string | undefined;

    if (!stroke || !translation) {
      throw new Error('Both stroke and translation are required');
    }

    const strokeTuple = normalizeSteno(stroke, false);
    let dictionary: StenoDictionaryLike;

    if (name) {
      const d = this.dictionaries.get(name);
      if (!d) {
        throw new Error(`Dictionary not found: ${name}`);
      }
      dictionary = d;
    } else {
      dictionary = this.dictionaries.firstWritable();
    }

    if (dictionary.readonly) {
      throw new Error(`Dictionary is read-only: ${dictionary.identifier}`);
    }

    dictionary.set(strokeTuple, translation);

    return { status: 'ok', stroke: strokeTuple.join('/'), translation };
  }

  private removeEntry(params: Record<string, unknown>): Record<string, unknown> {
    const stroke = params.stroke as string;
    const name = params.name as string | undefined;

    if (!stroke) {
      throw new Error('Stroke is required');
    }

    const strokeTuple = normalizeSteno(stroke, false);

    if (name) {
      const dictionary = this.dictionaries.get(name);
      if (!dictionary) {
        throw new Error(`Dictionary not found: ${name}`);
      }
      if (dictionary.readonly) {
        throw new Error(`Dictionary is read-only: ${name}`);
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
    const name = params.name as string | undefined;

    if (!stroke || !translation) {
      throw new Error('Both stroke and translation are required');
    }

    const strokeTuple = normalizeSteno(stroke, false);
    let dictionary: StenoDictionaryLike | null = null;

    if (name) {
      dictionary = this.dictionaries.get(name);
      if (!dictionary) {
        throw new Error(`Dictionary not found: ${name}`);
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
      throw new Error(`Dictionary is read-only: ${dictionary.identifier}`);
    }

    dictionary.set(strokeTuple, translation);

    return { status: 'ok', stroke: strokeTuple.join('/'), translation };
  }

  private async lookup(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const stroke = params.stroke as string;
    if (!stroke) {
      throw new Error('Stroke is required');
    }

    const strokeTuple = normalizeSteno(stroke, false);
    const translation = await this.dictionaries.lookup(strokeTuple);

    return {
      stroke: strokeTuple.join('/'),
      translation,
    };
  }

  private async reverseLookup(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const translation = params.translation as string;
    if (!translation) {
      throw new Error('Translation is required');
    }

    const strokes = await this.dictionaries.reverseLookup(translation);

    return {
      translation,
      strokes: [...strokes].map(s => s.join('/')),
    };
  }

  private listDictionaries(): Record<string, unknown> {
    return { dictionaries: this.describeDictionaries() };
  }

  private getDictionaryState(): Record<string, unknown> {
    return { dictionaries: this.describeDictionaries(), solo: this.soloEnabled };
  }

  private getDictionaryEntries(params: Record<string, unknown>): Record<string, unknown> {
    const name = params.name as string;
    if (!name) {
      throw new Error('Dictionary name is required');
    }

    const dictionary = this.dictionaries.get(name);
    if (!dictionary) {
      throw new Error(`Dictionary not found: ${name}`);
    }

    // Python dictionaries may not have enumerable entries
    if (dictionary instanceof PythonDictionary) {
      throw new Error('Cannot get entries from Python dictionary. Use export_dictionary instead.');
    }

    const entries = dictionary.items().map(([strokeTuple, translation]) => ({
      stroke: strokeTuple.join('/'),
      translation,
    }));

    return { name, entries };
  }

  private parsePagination(params: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
    const rawPage = params.page;
    const rawPageSize = params.page_size;
    const page = rawPage === undefined ? 1 : Number(rawPage);
    const pageSize = rawPageSize === undefined ? 50 : Number(rawPageSize);

    if (!Number.isInteger(page) || page < 1) {
      throw new Error('page must be a positive integer');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      throw new Error('page_size must be an integer between 1 and 500');
    }

    return {
      page,
      pageSize,
      offset: (page - 1) * pageSize,
    };
  }

  private parseSortOrder(sort: unknown): string {
    const value = sort === undefined ? 'alphabetic' : String(sort);
    switch (value) {
      case 'short_first':
        return 'short_first';
      case 'long_first':
        return 'long_first';
      case 'alphabetic':
        return 'alphabetic';
      default:
        throw new Error('sort must be one of: short_first, long_first, alphabetic');
    }
  }

  private parseOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  private resolveOptionalDictionaryIdentifier(value: unknown): string | null {
    const identifier = this.parseOptionalString(value);
    if (!identifier) {
      return null;
    }
    const idx = this.findDictionaryIndex(identifier);
    return this.dictionaries.dicts[idx].identifier;
  }

  private listAllEntries(): Array<{ dictionary: string; stroke: string; translation: string }> {
    const entries: Array<{ dictionary: string; stroke: string; translation: string }> = [];
    for (const dictionary of this.dictionaries.dicts) {
      for (const [strokeTuple, translation] of dictionary.items()) {
        entries.push({
          dictionary: dictionary.identifier,
          stroke: strokeTuple.join('/'),
          translation,
        });
      }
    }
    return entries;
  }

  private entryLength(stroke: string): number {
    return stroke.replace(/\//g, '').length;
  }

  private sortEntries(
    entries: Array<{ dictionary: string; stroke: string; translation: string }>,
    sort: string
  ): Array<{ dictionary: string; stroke: string; translation: string }> {
    const sorted = [...entries];
    if (sort === 'short_first') {
      sorted.sort((a, b) =>
        this.entryLength(a.stroke) - this.entryLength(b.stroke) ||
        a.stroke.localeCompare(b.stroke) ||
        a.translation.localeCompare(b.translation, undefined, { sensitivity: 'base' })
      );
      return sorted;
    }
    if (sort === 'long_first') {
      sorted.sort((a, b) =>
        this.entryLength(b.stroke) - this.entryLength(a.stroke) ||
        a.stroke.localeCompare(b.stroke) ||
        a.translation.localeCompare(b.translation, undefined, { sensitivity: 'base' })
      );
      return sorted;
    }

    sorted.sort((a, b) =>
      a.translation.localeCompare(b.translation, undefined, { sensitivity: 'base' }) ||
      a.stroke.localeCompare(b.stroke) ||
      a.dictionary.localeCompare(b.dictionary)
    );
    return sorted;
  }

  private enumerateEntries(params: Record<string, unknown>): Record<string, unknown> {
    const dictionary = this.resolveOptionalDictionaryIdentifier(params.dictionary);
    const { page, pageSize, offset } = this.parsePagination(params);
    const sort = this.parseSortOrder(params.sort);
    const filtered = this.listAllEntries().filter(entry => !dictionary || entry.dictionary === dictionary);
    const sorted = this.sortEntries(filtered, sort);
    const rows = sorted.slice(offset, offset + pageSize);
    const total = sorted.length;

    const result: Record<string, unknown> = {
      entries: rows,
      total,
      page,
      page_size: pageSize,
      has_more: offset + rows.length < total,
      sort,
    };
    if (dictionary) {
      result.dictionary = dictionary;
    }
    return result;
  }

  private searchEntries(params: Record<string, unknown>): Record<string, unknown> {
    const strokeQuery = this.parseOptionalString(params.stroke);
    const outputQuery = this.parseOptionalString(params.output);
    const dictionary = this.resolveOptionalDictionaryIdentifier(params.dictionary);
    const { page, pageSize, offset } = this.parsePagination(params);
    const sort = this.parseSortOrder(params.sort);

    if (!strokeQuery && !outputQuery) {
      throw new Error('At least one of stroke or output is required');
    }

    const normalizedStroke = strokeQuery?.toLowerCase() ?? null;
    const normalizedOutput = outputQuery?.toLowerCase() ?? null;
    const filtered = this.listAllEntries().filter(entry => {
      if (dictionary && entry.dictionary !== dictionary) return false;
      if (normalizedStroke && !entry.stroke.toLowerCase().includes(normalizedStroke)) return false;
      if (normalizedOutput && !entry.translation.toLowerCase().includes(normalizedOutput)) return false;
      return true;
    });
    const sorted = this.sortEntries(filtered, sort);
    const rows = sorted.slice(offset, offset + pageSize);
    const total = sorted.length;

    const result: Record<string, unknown> = {
      entries: rows,
      total,
      page,
      page_size: pageSize,
      has_more: offset + rows.length < total,
      sort,
    };
    if (strokeQuery) {
      result.stroke = strokeQuery;
    }
    if (outputQuery) {
      result.output = outputQuery;
    }
    if (dictionary) {
      result.dictionary = dictionary;
    }
    return result;
  }

  /**
   * Export a dictionary - dumps data to output as a protocol message
   * 
   * For JSON dictionaries: returns `data` (stroke -> translation mapping)
   * For Python dictionaries: returns `pythonCode` (Python source code)
   */
  private exportDictionary(params: Record<string, unknown>): Record<string, unknown> {
    const name = params.name as string;
    if (!name) {
      throw new Error('Dictionary name is required');
    }

    const dictionary = this.dictionaries.get(name);
    if (!dictionary) {
      throw new Error(`Dictionary not found: ${name}`);
    }

    if (dictionary instanceof PythonDictionary) {
      // Export Python dictionary as code
      return {
        status: 'ok',
        name,
        type: 'python',
        pythonCode: dictionary.pythonCode,
      };
    } else {
      // Export JSON dictionary as entries
      const data: Record<string, string> = {};
      for (const [strokeTuple, translation] of dictionary.items()) {
        data[strokeTuple.join('/')] = translation;
      }

      return {
        status: 'ok',
        name,
        type: 'json',
        data,
      };
    }
  }

  /**
   * Import a dictionary - reads entries from the request
   * 
   * For JSON dictionaries: requires `type: "json"` and `data` (stroke -> translation mapping)
   * For Python dictionaries: requires `type: "python"` and `pythonCode` (Python source code)
   */
  private async importDictionary(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const name = params.name as string;
    const dictType = params.type as DictionaryType;
    const merge = params.merge as boolean ?? false;

    if (!name) {
      throw new Error('Dictionary name is required');
    }
    if (!dictType || (dictType !== 'json' && dictType !== 'python')) {
      throw new Error('Dictionary type is required and must be "json" or "python"');
    }

    if (dictType === 'python') {
      const pythonCode = params.pythonCode as string;
      if (!pythonCode || typeof pythonCode !== 'string') {
        throw new Error('pythonCode is required for Python dictionaries');
      }

      // For Python dictionaries, we don't support merge - just replace
      if (merge) {
        throw new Error('Merge is not supported for Python dictionaries. Python dictionaries store code, not entries.');
      }

      let dictionary = this.dictionaries.get(name);
      if (dictionary) {
        if (dictionary instanceof PythonDictionary) {
          dictionary.terminate();
        }
      }

      // Create new Python dictionary from code
      const loaded = await createPythonDictionary(name, pythonCode);
      
      if (!dictionary) {
        this.dictionaries.setDicts([...this.dictionaries.dicts, loaded]);
      } else {
        const updated = this.dictionaries.dicts.map(d => (d.identifier === name ? loaded : d));
        this.dictionaries.setDicts(updated);
      }

      // Persist to DB
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO dictionaries (name, type, enabled, readonly, priority, python_code)
        VALUES (?, 'python', ?, 1, ?, ?)
      `);
      // Use current priority or max+1? For now, we update priorities after insert
      stmt.run(name, loaded.enabled ? 1 : 0, 0, pythonCode);
      this.updateDictionaryPriorityInDb();

      return {
        status: 'ok',
        name,
        type: 'python',
        entries: loaded.length,
      };
    } else {
      // JSON dictionary
      const data = params.data as Record<string, string>;
      if (!data || typeof data !== 'object') {
        throw new Error('data is required for JSON dictionaries');
      }

      let dictionary = this.dictionaries.get(name);
      let isNew = false;
      
      if (!dictionary) {
        isNew = true;
        // Create a new dictionary
        dictionary = createJsonDictionary(name, {}, this.db);
        const dicts = [...this.dictionaries.dicts, dictionary];
        this.dictionaries.setDicts(dicts);
      } else if (dictionary.readonly) {
        throw new Error(`Dictionary is read-only: ${name}`);
      }

      // Persist to DB if new
      if (isNew) {
         const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO dictionaries (name, type, enabled, readonly, priority)
          VALUES (?, 'json', ?, ?, ?)
        `);
        stmt.run(name, dictionary.enabled ? 1 : 0, dictionary.readonly ? 1 : 0, 0);
        this.updateDictionaryPriorityInDb();
      }

      if (!merge) {
        dictionary.clear();
      }

      // Import entries with streaming normalization to avoid large intermediate arrays
      function* normalizedEntries(): Generator<[string[], string]> {
        for (const [stroke, translation] of Object.entries(data)) {
          yield [normalizeSteno(stroke, false), translation];
        }
      }

      dictionary.update(normalizedEntries());

      return {
        status: 'ok',
        name,
        type: 'json',
        entries: dictionary.length,
      };
    }
  }
}
