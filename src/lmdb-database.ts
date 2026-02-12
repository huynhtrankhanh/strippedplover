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
  }

  exec(_sql: string): void {
    // SQLite-compatible no-op for PRAGMAs and BEGIN/COMMIT statements.
  }

  prepare(sql: string): LmdbStatement {
    return new LmdbStatement(this, sql);
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
    for (const { key } of this.entries.getRange({
      start: entryRangeStart(name),
      end: entryRangeEnd(name),
    })) {
      this.entries.remove(key as Buffer);
    }
  }

  getEntry(dictionary: string, stroke: string): string | null {
    const value = this.entries.get(entryKey(dictionary, stroke));
    return value ?? null;
  }

  setEntry(dictionary: string, stroke: string, translation: string): void {
    this.entries.putSync(entryKey(dictionary, stroke), translation);
  }

  deleteEntry(dictionary: string, stroke: string): boolean {
    return Boolean(this.entries.removeSync(entryKey(dictionary, stroke)) as unknown);
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
    for (const _ of this.iterateEntries(dictionary)) {
      count++;
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
    for (const { stroke, translation: value } of this.iterateEntries(dictionary)) {
      if (value === translation) {
        results.push(stroke);
      }
    }
    return results;
  }

  caseReverseLookup(dictionary: string, translation: string): string[] {
    const target = translation.toLowerCase();
    const results: string[] = [];
    for (const { translation: value } of this.iterateEntries(dictionary)) {
      if (value.toLowerCase() === target) {
        results.push(value);
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
    const sorted = rows.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return sorted[0];
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
