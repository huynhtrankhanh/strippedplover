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

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, ' ').toUpperCase();
}

function entryId(dictionary: string, stroke: string): string {
  return `${dictionary}${ENTRY_SEPARATOR}${stroke}`;
}

function splitEntryId(id: string): { dictionary: string; stroke: string } {
  const separatorIndex = id.indexOf(ENTRY_SEPARATOR);
  if (separatorIndex === -1) {
    return { dictionary: '', stroke: id };
  }
  return {
    dictionary: id.slice(0, separatorIndex),
    stroke: id.slice(separatorIndex + ENTRY_SEPARATOR.length),
  };
}

function openIndexedDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('dictionaries')) {
        db.createObjectStore('dictionaries', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('byDictionary', 'dictionary', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

export class DatabaseSync {
  readonly ready: Promise<void>;
  private dbName: string;
  private idb: IDBDatabase | null = null;
  private dictionaries = new Map<string, DictionaryMeta>();
  private entries = new Map<string, string>();
  private persistChain: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.dbName = `strippedplover:${path || 'default'}`;
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.idb = await openIndexedDb(this.dbName);
    await this.loadFromIndexedDb();
  }

  private async loadFromIndexedDb(): Promise<void> {
    const db = this.idb;
    if (!db) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['dictionaries', 'entries'], 'readonly');
      const dictionariesStore = tx.objectStore('dictionaries');
      const entriesStore = tx.objectStore('entries');

      const dictReq = dictionariesStore.getAll();
      const entriesReq = entriesStore.getAll();

      tx.oncomplete = () => {
        const dicts = (dictReq.result ?? []) as Array<{ name: string } & DictionaryMeta>;
        const entries = (entriesReq.result ?? []) as Array<{ id: string; dictionary: string; stroke: string; translation: string }>;

        for (const dict of dicts) {
          this.dictionaries.set(dict.name, {
            type: dict.type,
            enabled: dict.enabled,
            readonly: dict.readonly,
            priority: dict.priority,
            python_code: dict.python_code ?? null,
          });
        }

        for (const entry of entries) {
          this.entries.set(entry.id, entry.translation);
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error('Failed to read IndexedDB'));
    });
  }

  private queuePersist(operation: (db: IDBDatabase) => Promise<void>): void {
    this.persistChain = this.persistChain
      .then(async () => {
        const db = this.idb;
        if (!db) return;
        await operation(db);
      })
      .catch(err => {
        console.error('IndexedDB persistence error:', err);
      });
  }

  exec(_sql: string): void {
    // SQLite-compatible no-op for PRAGMAs and BEGIN/COMMIT statements.
  }

  prepare(sql: string): IndexedDbStatement {
    return new IndexedDbStatement(this, sql);
  }

  getDictionaries(): Array<DictionaryMeta & { name: string }> {
    return Array.from(this.dictionaries.entries()).map(([name, meta]) => ({ name, ...meta }));
  }

  putDictionary(name: string, meta: DictionaryMeta, ignoreExisting = false): void {
    if (ignoreExisting && this.dictionaries.has(name)) {
      return;
    }

    const normalized: DictionaryMeta = {
      ...meta,
      python_code: meta.python_code ?? null,
    };
    this.dictionaries.set(name, normalized);

    this.queuePersist(async db => {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['dictionaries'], 'readwrite');
        tx.objectStore('dictionaries').put({ name, ...normalized });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to persist dictionary'));
      });
    });
  }

  updateDictionary(name: string, updater: (current: DictionaryMeta | undefined) => DictionaryMeta | undefined): void {
    const current = this.dictionaries.get(name);
    const updated = updater(current);
    if (!updated) {
      return;
    }

    const normalized: DictionaryMeta = {
      ...updated,
      python_code: updated.python_code ?? null,
    };
    this.dictionaries.set(name, normalized);

    this.queuePersist(async db => {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['dictionaries'], 'readwrite');
        tx.objectStore('dictionaries').put({ name, ...normalized });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to update dictionary'));
      });
    });
  }

  deleteDictionary(name: string): void {
    this.dictionaries.delete(name);

    const entryIdsToDelete: string[] = [];
    for (const id of this.entries.keys()) {
      if (splitEntryId(id).dictionary === name) {
        entryIdsToDelete.push(id);
      }
    }
    for (const id of entryIdsToDelete) {
      this.entries.delete(id);
    }

    this.queuePersist(async db => {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['dictionaries', 'entries'], 'readwrite');
        tx.objectStore('dictionaries').delete(name);
        const entriesStore = tx.objectStore('entries');
        for (const id of entryIdsToDelete) {
          entriesStore.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to delete dictionary'));
      });
    });
  }

  getEntry(dictionary: string, stroke: string): string | null {
    return this.entries.get(entryId(dictionary, stroke)) ?? null;
  }

  setEntry(dictionary: string, stroke: string, translation: string): void {
    const id = entryId(dictionary, stroke);
    this.entries.set(id, translation);

    this.queuePersist(async db => {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['entries'], 'readwrite');
        tx.objectStore('entries').put({ id, dictionary, stroke, translation });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to set entry'));
      });
    });
  }

  deleteEntry(dictionary: string, stroke: string): boolean {
    const id = entryId(dictionary, stroke);
    const existed = this.entries.delete(id);

    if (existed) {
      this.queuePersist(async db => {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['entries'], 'readwrite');
          tx.objectStore('entries').delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('Failed to delete entry'));
        });
      });
    }

    return existed;
  }

  *iterateEntries(dictionary: string): Generator<{ stroke: string; translation: string }> {
    for (const [id, translation] of this.entries.entries()) {
      const split = splitEntryId(id);
      if (split.dictionary === dictionary) {
        yield { stroke: split.stroke, translation };
      }
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

class IndexedDbStatement {
  private kind: StatementKind;
  private normalized: string;

  constructor(private store: DatabaseSync, sql: string) {
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
