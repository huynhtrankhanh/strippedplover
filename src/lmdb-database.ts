import { open, type Database, type RootDatabase } from 'lmdb';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type DictionaryMeta = {
  type: string;
  enabled: number;
  readonly: number;
  priority: number;
  python_code: string | null;
};

export type EntrySortOrder = 'alphabetic' | 'short_first' | 'long_first';

export interface EntryQueryOptions {
  dictionary?: string | null;
  stroke?: string | null;
  output?: string | null;
  match?: 'substring' | 'prefix';
  sort: EntrySortOrder;
  limit: number;
  offset: number;
}

export interface EntryQueryResult {
  entries: Array<{ dictionary: string; stroke: string; translation: string }>;
  total: number;
}

type StatementKind =
  | 'select-dictionaries'
  | 'insert-dictionary'
  | 'insert-dictionary-ignore'
  | 'insert-dictionary-python'
  | 'update-dictionary-priority'
  | 'update-dictionary-enabled'
  | 'delete-dictionary'
  | 'count-entries'
  | 'get-entry'
  | 'insert-entry'
  | 'delete-entry'
  | 'max-length'
  | 'entries'
  | 'reverse-lookup'
  | 'case-reverse-lookup';

const ENTRY_SEPARATOR = '\x1f';
const ENTRY_SEPARATOR_END = String.fromCharCode(ENTRY_SEPARATOR.charCodeAt(0) + 1);
const INDEX_SEPARATOR = '\x1f';
const INDEX_SEPARATOR_END = String.fromCharCode(INDEX_SEPARATOR.charCodeAt(0) + 1);

function indexKey(...parts: Array<string | number>): Buffer {
  return Buffer.from(parts.map(part => String(part)).join(INDEX_SEPARATOR));
}

function indexPrefix(...parts: Array<string | number>): Buffer {
  return Buffer.from(`${parts.map(part => String(part)).join(INDEX_SEPARATOR)}${INDEX_SEPARATOR}`);
}

function indexPrefixEnd(...parts: Array<string | number>): Buffer {
  return Buffer.from(`${parts.map(part => String(part)).join(INDEX_SEPARATOR)}${INDEX_SEPARATOR_END}`);
}

function strokeLength(stroke: string): number {
  return stroke.length === 0 ? 0 : stroke.split('/').length;
}

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, ' ').toUpperCase();
}

function entryKey(dictionary: string, stroke: string): Buffer {
  return Buffer.from(`${dictionary}${ENTRY_SEPARATOR}${stroke}`);
}

function entryRangeStart(dictionary: string): Buffer {
  return Buffer.from(`${dictionary}${ENTRY_SEPARATOR}`);
}

function entryRangeEnd(dictionary: string): Buffer {
  return Buffer.from(`${dictionary}${ENTRY_SEPARATOR_END}`);
}

export class DatabaseSync {
  private root: RootDatabase<unknown, Buffer>;
  private dictionaries: Database<DictionaryMeta, Buffer>;
  private entries: Database<string, Buffer>;
  private translationIndex: Database<string, Buffer>;
  private strokeIndex: Database<string, Buffer>;
  private lengthIndex: Database<string, Buffer>;

  constructor(path: string) {
    const dbPath = path === ':memory:' ? mkdtempSync(join(tmpdir(), 'strippedplover-lmdb-')) : path;
    this.root = open({
      path: dbPath,
      // Disable compression to keep puts synchronous and fast for small values.
      compression: false,
    });
    this.dictionaries = this.root.openDB({
      name: 'dictionaries',
      encoding: 'json',
    });
    this.entries = this.root.openDB({
      name: 'entries',
      encoding: 'string',
    });
    this.translationIndex = this.root.openDB({
      name: 'entries_by_translation',
      encoding: 'string',
    });
    this.strokeIndex = this.root.openDB({
      name: 'entries_by_stroke',
      encoding: 'string',
    });
    this.lengthIndex = this.root.openDB({
      name: 'entries_by_stroke_length',
      encoding: 'string',
    });
    this.rebuildEntryIndexes();
  }

  exec(_sql: string): void {
    // SQL DDL is retained for API compatibility; LMDB indexes are maintained below.
  }

  prepare(sql: string): LmdbStatement {
    return new LmdbStatement(this, sql);
  }


  private addEntryIndexes(dictionary: string, stroke: string, translation: string): void {
    this.translationIndex.putSync(indexKey(translation.toLowerCase(), translation, stroke, dictionary), '');
    this.strokeIndex.putSync(indexKey(stroke.toLowerCase(), stroke, dictionary), '');
    this.lengthIndex.putSync(indexKey(strokeLength(stroke).toString().padStart(10, '0'), stroke, translation, dictionary), '');
  }

  private removeEntryIndexes(dictionary: string, stroke: string, translation: string): void {
    this.translationIndex.removeSync(indexKey(translation.toLowerCase(), translation, stroke, dictionary));
    this.strokeIndex.removeSync(indexKey(stroke.toLowerCase(), stroke, dictionary));
    this.lengthIndex.removeSync(indexKey(strokeLength(stroke).toString().padStart(10, '0'), stroke, translation, dictionary));
  }

  private rebuildEntryIndexes(): void {
    this.translationIndex.clearSync();
    this.strokeIndex.clearSync();
    this.lengthIndex.clearSync();
    for (const { key, value } of this.entries.getRange({})) {
      const keyText = (key as Buffer).toString('utf8');
      const separator = keyText.indexOf(ENTRY_SEPARATOR);
      if (separator === -1 || value === undefined) continue;
      this.addEntryIndexes(keyText.slice(0, separator), keyText.slice(separator + ENTRY_SEPARATOR.length), value as string);
    }
  }

  private unpackIndexEntry(key: Buffer, sort: EntrySortOrder): { dictionary: string; stroke: string; translation: string } | null {
    const parts = key.toString('utf8').split(INDEX_SEPARATOR);
    if (sort === 'alphabetic') {
      const [, translation, stroke, dictionary] = parts;
      return dictionary && stroke && translation !== undefined ? { dictionary, stroke, translation } : null;
    }
    const [, stroke, translation, dictionary] = parts;
    return dictionary && stroke && translation !== undefined ? { dictionary, stroke, translation } : null;
  }

  private entryMatches(
    entry: { dictionary: string; stroke: string; translation: string },
    options: EntryQueryOptions
  ): boolean {
    if (options.dictionary && entry.dictionary !== options.dictionary) return false;
    const match = options.match ?? 'substring';
    if (options.stroke) {
      const haystack = entry.stroke.toLowerCase();
      const needle = options.stroke.toLowerCase();
      if (match === 'prefix' ? !haystack.startsWith(needle) : !haystack.includes(needle)) return false;
    }
    if (options.output) {
      const haystack = entry.translation.toLowerCase();
      const needle = options.output.toLowerCase();
      if (match === 'prefix' ? !haystack.startsWith(needle) : !haystack.includes(needle)) return false;
    }
    return true;
  }

  queryEntries(options: EntryQueryOptions): EntryQueryResult {
    const index = options.sort === 'alphabetic' ? this.translationIndex : this.lengthIndex;
    const prefix = options.sort === 'alphabetic' && options.match === 'prefix' && options.output
      ? [options.output.toLowerCase()]
      : options.sort !== 'alphabetic' && options.match === 'prefix' && options.stroke
        ? []
        : null;
    const range = prefix && prefix.length > 0
      ? { start: indexPrefix(...prefix), end: indexPrefixEnd(...prefix) }
      : {};
    const rows: Array<{ dictionary: string; stroke: string; translation: string }> = [];
    let total = 0;
    const rangeOptions = { ...range, reverse: options.sort === 'long_first' };
    for (const { key } of index.getRange(rangeOptions)) {
      const entry = this.unpackIndexEntry(key as Buffer, options.sort);
      if (!entry || !this.entryMatches(entry, options)) continue;
      if (total >= options.offset && rows.length < options.limit) {
        rows.push(entry);
      }
      total++;
    }
    return { entries: rows, total };
  }

  // Helper methods used by statements
  getDictionaries(): Array<DictionaryMeta & { name: string }> {
    const rows: Array<DictionaryMeta & { name: string }> = [];
    for (const { key, value } of this.dictionaries.getRange({})) {
      if (!value) continue;
      rows.push({
        name: (key as Buffer).toString('utf8'),
        ...value,
      });
    }
    return rows;
  }

  putDictionary(
    name: string,
    meta: DictionaryMeta,
    ignoreExisting = false
  ): void {
    const key = Buffer.from(name);
    if (ignoreExisting && this.dictionaries.get(key) !== undefined) {
      return;
    }
    this.dictionaries.putSync(key, { ...meta, python_code: meta.python_code ?? null });
  }

  updateDictionary(
    name: string,
    updater: (current: DictionaryMeta | undefined) => DictionaryMeta | undefined
  ): void {
    const key = Buffer.from(name);
    const current = this.dictionaries.get(key) as DictionaryMeta | undefined;
    const updated = updater(current);
    if (updated) {
      this.dictionaries.putSync(key, updated);
    }
  }

  deleteDictionary(name: string): void {
    const key = Buffer.from(name);
    this.dictionaries.removeSync(key);
    // Remove all entries for this dictionary
    for (const { key, value } of this.entries.getRange({
      start: entryRangeStart(name),
      end: entryRangeEnd(name),
    })) {
      const keyText = (key as Buffer).toString('utf8');
      const stroke = keyText.slice(name.length + ENTRY_SEPARATOR.length);
      if (value !== undefined) {
        this.removeEntryIndexes(name, stroke, value as string);
      }
      this.entries.removeSync(key as Buffer);
    }
  }

  getEntry(dictionary: string, stroke: string): string | null {
    const value = this.entries.get(entryKey(dictionary, stroke));
    return value ?? null;
  }

  setEntry(dictionary: string, stroke: string, translation: string): void {
    const key = entryKey(dictionary, stroke);
    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.removeEntryIndexes(dictionary, stroke, previous);
    }
    this.entries.putSync(key, translation);
    this.addEntryIndexes(dictionary, stroke, translation);
  }

  deleteEntry(dictionary: string, stroke: string): boolean {
    const key = entryKey(dictionary, stroke);
    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.removeEntryIndexes(dictionary, stroke, previous);
    }
    return Boolean(this.entries.removeSync(key) as unknown);
  }

  *iterateEntries(dictionary: string): Generator<{ stroke: string; translation: string }> {
    for (const { key, value } of this.entries.getRange({
      start: entryRangeStart(dictionary),
      end: entryRangeEnd(dictionary),
    })) {
      const strokeStr = (key as Buffer).toString('utf8');
      const stroke = strokeStr.slice(dictionary.length + ENTRY_SEPARATOR.length);
      yield { stroke, translation: value as string };
    }
  }

  countEntries(dictionary: string): number {
    let count = 0;
    for (const entry of this.iterateEntries(dictionary)) {
      if (entry) count++;
    }
    return count;
  }

  maxStrokeLength(dictionary: string): number {
    let maxLen = 0;
    for (const { stroke } of this.iterateEntries(dictionary)) {
      const len = stroke.split('/').length;
      if (len > maxLen) {
        maxLen = len;
      }
    }
    return maxLen;
  }

  reverseLookup(dictionary: string, translation: string): string[] {
    const results: string[] = [];
    for (const { stroke, translation: entryTranslation } of this.iterateEntries(dictionary)) {
      if (entryTranslation === translation) {
        results.push(stroke);
      }
    }
    return results;
  }

  caseReverseLookup(dictionary: string, translation: string): string[] {
    const target = translation.toLowerCase();
    const results: string[] = [];
    for (const { translation: entryTranslation } of this.iterateEntries(dictionary)) {
      if (entryTranslation.toLowerCase() === target) {
        results.push(entryTranslation);
      }
    }
    return Array.from(new Set(results));
  }
}

class LmdbStatement {
  private kind: StatementKind;
  private normalized: string;

  constructor(private store: DatabaseSync, private sql: string) {
    this.normalized = normalizeSql(sql);
    this.kind = this.detectKind();
  }

  run(...args: unknown[]): { changes?: number } {
    switch (this.kind) {
      case 'insert-dictionary': {
        const [name, enabled, readonly, priority] = args as [string, number, number, number];
        this.store.putDictionary(name, {
          type: 'json',
          enabled: enabled ? 1 : 0,
          readonly: readonly ? 1 : 0,
          priority: Number(priority) || 0,
          python_code: null,
        });
        return { changes: 1 };
      }
      case 'insert-dictionary-ignore': {
        const [name, type, enabled, readonly, priority] = args as [string, string, number, number, number];
        this.store.putDictionary(
          name,
          {
            type,
            enabled: enabled ? 1 : 0,
            readonly: readonly ? 1 : 0,
            priority: Number(priority) || 0,
            python_code: null,
          },
          true
        );
        return { changes: 1 };
      }
      case 'insert-dictionary-python': {
        const [name, enabled, priority, pythonCode] = args as [string, number, number, string];
        this.store.putDictionary(name, {
          type: 'python',
          enabled: enabled ? 1 : 0,
          readonly: 1,
          priority: Number(priority) || 0,
          python_code: pythonCode ?? null,
        });
        return { changes: 1 };
      }
      case 'update-dictionary-priority': {
        const [priority, name] = args as [number, string];
        this.store.updateDictionary(name, current => {
          if (!current) return current;
          return { ...current, priority: Number(priority) || 0 };
        });
        return { changes: 1 };
      }
      case 'update-dictionary-enabled': {
        const [enabled, name] = args as [number, string];
        this.store.updateDictionary(name, current => {
          if (!current) return current;
          return { ...current, enabled: enabled ? 1 : 0 };
        });
        return { changes: 1 };
      }
      case 'delete-dictionary': {
        const [name] = args as [string];
        this.store.deleteDictionary(name);
        return { changes: 1 };
      }
      case 'insert-entry': {
        const [dictionary, stroke, translation] = args as [string, string, string];
        this.store.setEntry(dictionary, stroke, translation);
        return { changes: 1 };
      }
      case 'delete-entry': {
        const [stroke, dictionary] = args as [string, string];
        const removed = this.store.deleteEntry(dictionary, stroke);
        return { changes: removed ? 1 : 0 };
      }
      default:
        return {};
    }
  }

  get(...args: unknown[]): Record<string, unknown> | undefined {
    switch (this.kind) {
      case 'select-dictionaries': {
        const rows = this.store.getDictionaries();
        return rows.reduce<DictionaryMeta & { name: string } | undefined>(
          (max, row) => ((row.priority ?? 0) > (max?.priority ?? 0) ? row : max),
          rows[0]
        );
      }
      case 'count-entries': {
        const [dictionary] = args as [string];
        return { count: this.store.countEntries(dictionary) };
      }
      case 'get-entry': {
        const [stroke, dictionary] = args as [string, string];
        const translation = this.store.getEntry(dictionary, stroke);
        return translation !== null ? { translation } : undefined;
      }
      case 'max-length': {
        const [dictionary] = args as [string];
        const maxLen = this.store.maxStrokeLength(dictionary);
        return { maxLen };
      }
      default:
        return undefined;
    }
  }

  all(...args: unknown[]): Array<Record<string, unknown>> {
    switch (this.kind) {
      case 'select-dictionaries': {
        const rows = this.store.getDictionaries();
        return rows
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .map(({ name, ...rest }) => ({ name, ...rest }));
      }
      case 'entries': {
        const [dictionary] = args as [string];
        return Array.from(this.store.iterateEntries(dictionary));
      }
      case 'reverse-lookup': {
        const [translation, dictionary] = args as [string, string];
        return this.store.reverseLookup(dictionary, translation).map(stroke => ({ stroke }));
      }
      case 'case-reverse-lookup': {
        const [translation, dictionary] = args as [string, string];
        return this.store.caseReverseLookup(dictionary, translation).map(t => ({ translation: t }));
      }
      case 'count-entries': {
        const [dictionary] = args as [string];
        return [{ count: this.store.countEntries(dictionary) }];
      }
      case 'get-entry': {
        const [stroke, dictionary] = args as [string, string];
        const translation = this.store.getEntry(dictionary, stroke);
        return translation !== null ? [{ translation }] : [];
      }
      default:
        return [];
    }
  }

  iterate(...args: unknown[]): Generator<Record<string, unknown>> {
    switch (this.kind) {
      case 'entries': {
        const [dictionary] = args as [string];
        return this.store.iterateEntries(dictionary) as Generator<Record<string, unknown>>;
      }
      default:
        return (function* (): Generator<Record<string, unknown>> {})();
    }
  }

  private detectKind(): StatementKind {
    if (this.normalized.startsWith('SELECT * FROM DICTIONARIES ORDER BY PRIORITY DESC')) {
      return 'select-dictionaries';
    }
    if (this.normalized.startsWith('INSERT OR REPLACE INTO DICTIONARIES') && this.normalized.includes('PYTHON_CODE')) {
      return 'insert-dictionary-python';
    }
    if (this.normalized.startsWith('INSERT OR REPLACE INTO DICTIONARIES')) {
      return 'insert-dictionary';
    }
    if (this.normalized.startsWith('INSERT OR IGNORE INTO DICTIONARIES')) {
      return 'insert-dictionary-ignore';
    }
    if (this.normalized.startsWith('UPDATE DICTIONARIES SET PRIORITY')) {
      return 'update-dictionary-priority';
    }
    if (this.normalized.startsWith('UPDATE DICTIONARIES SET ENABLED')) {
      return 'update-dictionary-enabled';
    }
    if (this.normalized.startsWith('DELETE FROM DICTIONARIES')) {
      return 'delete-dictionary';
    }
    if (this.normalized.startsWith('SELECT COUNT(*) AS COUNT FROM ENTRIES')) {
      return 'count-entries';
    }
    if (this.normalized.startsWith('SELECT TRANSLATION FROM ENTRIES')) {
      return 'get-entry';
    }
    if (this.normalized.startsWith('INSERT OR REPLACE INTO ENTRIES')) {
      return 'insert-entry';
    }
    if (this.normalized.startsWith('DELETE FROM ENTRIES')) {
      return 'delete-entry';
    }
    if (this.normalized.startsWith('SELECT MAX(LENGTH(STROKE)')) {
      return 'max-length';
    }
    if (this.normalized.startsWith('SELECT STROKE, TRANSLATION FROM ENTRIES')) {
      return 'entries';
    }
    if (this.normalized.startsWith('SELECT STROKE FROM ENTRIES WHERE TRANSLATION')) {
      return 'reverse-lookup';
    }
    if (this.normalized.startsWith('SELECT DISTINCT TRANSLATION FROM ENTRIES WHERE LOWER(TRANSLATION)')) {
      return 'case-reverse-lookup';
    }
    return 'entries';
  }
}
