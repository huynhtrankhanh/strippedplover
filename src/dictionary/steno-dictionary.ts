/**
 * SQLite-backed Steno Dictionary
 * 
 * This module provides a steno dictionary implementation backed by
 * the Node.js built-in SQLite module for fast entry insertion and updates.
 */

import { DatabaseSync } from 'node:sqlite';
import { Stroke, normalizeSteno } from '../stroke.js';

export interface StenoDictionaryOptions {
  path?: string;
  readonly?: boolean;
  enabled?: boolean;
}

/**
 * A steno dictionary backed by SQLite
 */
export class StenoDictionary {
  private db: DatabaseSync;
  private _path: string;
  private _readonly: boolean;
  private _enabled: boolean;
  private _timestamp: number;
  private _longestKey: number;

  constructor(options: StenoDictionaryOptions = {}) {
    this._path = options.path ?? ':memory:';
    this._readonly = options.readonly ?? false;
    this._enabled = options.enabled ?? true;
    this._timestamp = Date.now();
    this._longestKey = 0;

    // Open SQLite database
    this.db = new DatabaseSync(this._path === ':memory:' ? ':memory:' : this._path);
    
    // Initialize schema
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        stroke TEXT PRIMARY KEY,
        translation TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_translation ON entries(translation);
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  get path(): string {
    return this._path;
  }

  set path(value: string) {
    this._path = value;
  }

  get readonly(): boolean {
    return this._readonly;
  }

  set readonly(value: boolean) {
    this._readonly = value;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  get timestamp(): number {
    return this._timestamp;
  }

  set timestamp(value: number) {
    this._timestamp = value;
  }

  get longestKey(): number {
    return this._longestKey;
  }

  /**
   * Get the number of entries in the dictionary
   */
  get length(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM entries');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Get a translation by stroke
   */
  get(strokeTuple: string[]): string | null {
    const stroke = strokeTuple.join('/');
    const stmt = this.db.prepare('SELECT translation FROM entries WHERE stroke = ?');
    const result = stmt.get(stroke) as { translation: string } | undefined;
    return result?.translation ?? null;
  }

  /**
   * Set a translation for a stroke
   */
  set(strokeTuple: string[], translation: string): void {
    if (this._readonly) {
      throw new Error('Dictionary is read-only');
    }

    const stroke = strokeTuple.join('/');
    
    // Delete existing entry if any (to update reverse lookup)
    this.delete(strokeTuple);

    // Insert new entry
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO entries (stroke, translation) VALUES (?, ?)'
    );
    stmt.run(stroke, translation);

    // Update longest key
    if (strokeTuple.length > this._longestKey) {
      this._longestKey = strokeTuple.length;
    }
  }

  /**
   * Delete an entry by stroke
   */
  delete(strokeTuple: string[]): boolean {
    if (this._readonly) {
      throw new Error('Dictionary is read-only');
    }

    const stroke = strokeTuple.join('/');
    const stmt = this.db.prepare('DELETE FROM entries WHERE stroke = ?');
    const result = stmt.run(stroke);
    
    // Recalculate longest key if needed
    if (strokeTuple.length === this._longestKey) {
      this.recalculateLongestKey();
    }

    return result.changes > 0;
  }

  /**
   * Check if a stroke exists in the dictionary
   */
  has(strokeTuple: string[]): boolean {
    return this.get(strokeTuple) !== null;
  }

  /**
   * Recalculate the longest key in the dictionary
   */
  private recalculateLongestKey(): void {
    const stmt = this.db.prepare(
      "SELECT MAX(LENGTH(stroke) - LENGTH(REPLACE(stroke, '/', '')) + 1) as maxLen FROM entries"
    );
    const result = stmt.get() as { maxLen: number | null };
    this._longestKey = result.maxLen ?? 0;
  }

  /**
   * Get all entries as an iterator
   */
  *entries(): Generator<[string[], string]> {
    const stmt = this.db.prepare('SELECT stroke, translation FROM entries');
    for (const row of stmt.all() as Array<{ stroke: string; translation: string }>) {
      yield [row.stroke.split('/'), row.translation];
    }
  }

  /**
   * Get all entries as an array
   */
  items(): Array<[string[], string]> {
    return [...this.entries()];
  }

  /**
   * Clear all entries
   */
  clear(): void {
    if (this._readonly) {
      throw new Error('Dictionary is read-only');
    }
    this.db.exec('DELETE FROM entries');
    this._longestKey = 0;
  }

  /**
   * Update dictionary with entries from an iterable
   */
  update(entries: Iterable<[string[], string]>): void {
    if (this._readonly) {
      throw new Error('Dictionary is read-only');
    }

    const insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO entries (stroke, translation) VALUES (?, ?)'
    );

    // Use a transaction for bulk inserts
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const [strokeTuple, translation] of entries) {
        const stroke = strokeTuple.join('/');
        insertStmt.run(stroke, translation);
        if (strokeTuple.length > this._longestKey) {
          this._longestKey = strokeTuple.length;
        }
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Reverse lookup - find all strokes that produce a translation
   */
  reverseLookup(translation: string): Set<string[]> {
    const stmt = this.db.prepare('SELECT stroke FROM entries WHERE translation = ?');
    const results = stmt.all(translation) as Array<{ stroke: string }>;
    return new Set(results.map(r => r.stroke.split('/')));
  }

  /**
   * Case-insensitive reverse lookup
   */
  caseReverseLookup(translation: string): Set<string> {
    const stmt = this.db.prepare(
      'SELECT DISTINCT translation FROM entries WHERE LOWER(translation) = LOWER(?)'
    );
    const results = stmt.all(translation) as Array<{ translation: string }>;
    return new Set(results.map(r => r.translation));
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Create a new dictionary at the given path
   */
  static create(path: string): StenoDictionary {
    return new StenoDictionary({ path, readonly: false });
  }

  /**
   * Load a dictionary from a JSON file
   */
  static loadFromJson(path: string, jsonContent: Record<string, string>): StenoDictionary {
    const dict = new StenoDictionary({ path });
    
    // Normalize and insert entries
    const entries: Array<[string[], string]> = [];
    for (const [stroke, translation] of Object.entries(jsonContent)) {
      try {
        const normalizedStroke = normalizeSteno(stroke, false);
        entries.push([normalizedStroke, translation]);
      } catch {
        // Skip invalid strokes
        entries.push([stroke.split('/'), translation]);
      }
    }
    
    dict.update(entries);
    return dict;
  }

  /**
   * Export dictionary to JSON format
   */
  toJson(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [strokeTuple, translation] of this.entries()) {
      result[strokeTuple.join('/')] = translation;
    }
    return result;
  }
}

/**
 * A collection of steno dictionaries with priority ordering
 */
export class StenoDictionaryCollection {
  private _dicts: StenoDictionary[] = [];
  private _filters: Array<(key: string[], value: string) => boolean> = [];

  constructor(dicts: StenoDictionary[] = []) {
    this.setDicts(dicts);
  }

  get dicts(): StenoDictionary[] {
    return this._dicts;
  }

  get longestKey(): number {
    let max = 0;
    for (const d of this._dicts) {
      if (d.enabled && d.longestKey > max) {
        max = d.longestKey;
      }
    }
    return max;
  }

  setDicts(dicts: StenoDictionary[]): void {
    this._dicts = [...dicts];
  }

  /**
   * Lookup a stroke in all dictionaries (respecting priority)
   */
  lookup(key: string[]): string | null {
    return this._lookup(key, this._filters);
  }

  /**
   * Raw lookup without filters
   */
  rawLookup(key: string[]): string | null {
    return this._lookup(key, []);
  }

  private _lookupKeepDeleted(
    key: string[],
    dicts?: StenoDictionary[],
    filters: Array<(key: string[], value: string) => boolean> = []
  ): string | null {
    const searchDicts = dicts ?? this._dicts;
    const keyLen = key.length;

    if (keyLen > this.longestKey) {
      return null;
    }

    for (const d of searchDicts) {
      if (!d.enabled) continue;
      if (keyLen > d.longestKey) continue;

      const value = d.get(key);
      if (value !== null) {
        // Check filters
        if (!filters.some(f => f(key, value))) {
          return value;
        }
      }
    }

    return null;
  }

  private _lookup(
    key: string[],
    filters: Array<(key: string[], value: string) => boolean> = []
  ): string | null {
    const result = this._lookupKeepDeleted(key, undefined, filters);
    if (result === null || result.toLowerCase() === '{plover:deleted}') {
      return null;
    }
    return result;
  }

  /**
   * Reverse lookup - find all strokes that produce a translation
   */
  reverseLookup(translation: string): Set<string[]> {
    const keys = new Set<string>();
    const result: string[][] = [];
    
    for (let n = 0; n < this._dicts.length; n++) {
      const d = this._dicts[n];
      if (!d.enabled) continue;

      for (const key of d.reverseLookup(translation)) {
        const keyStr = key.join('/');
        // Ignore if overridden by higher priority dictionary
        if (keys.has(keyStr)) continue;
        if (this._lookupKeepDeleted(key, this._dicts.slice(0, n)) !== null) continue;
        
        keys.add(keyStr);
        result.push(key);
      }
    }

    return new Set(result);
  }

  /**
   * Case-insensitive reverse lookup
   */
  caseReverseLookup(translation: string): Set<string> {
    const keys = new Set<string>();
    for (const d of this._dicts) {
      if (!d.enabled) continue;
      for (const value of d.caseReverseLookup(translation)) {
        keys.add(value);
      }
    }
    return keys;
  }

  /**
   * Get the first writable dictionary
   */
  firstWritable(): StenoDictionary {
    for (const d of this._dicts) {
      if (!d.readonly) {
        return d;
      }
    }
    throw new Error('No writable dictionary');
  }

  /**
   * Get a dictionary by path
   */
  get(path: string): StenoDictionary | null {
    for (const d of this._dicts) {
      if (d.path === path) {
        return d;
      }
    }
    return null;
  }

  /**
   * Add a filter function
   */
  addFilter(f: (key: string[], value: string) => boolean): void {
    this._filters.push(f);
  }

  /**
   * Remove a filter function
   */
  removeFilter(f: (key: string[], value: string) => boolean): void {
    const idx = this._filters.indexOf(f);
    if (idx !== -1) {
      this._filters.splice(idx, 1);
    }
  }

  /**
   * Iterator over dictionary paths
   */
  *[Symbol.iterator](): Generator<string> {
    for (const d of this._dicts) {
      yield d.path;
    }
  }
}
