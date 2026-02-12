/**
 * SQLite-backed Steno Dictionary
 * 
 * This module provides a steno dictionary implementation backed by
 * the Node.js built-in SQLite module for fast entry insertion and updates.
 */

import { DatabaseSync } from '../lmdb-database.js';
import { Stroke, normalizeSteno } from '../stroke.js';

export interface StenoDictionaryLike {
  identifier: string;
  readonly: boolean;
  enabled: boolean;
  longestKey: number;
  length: number;
  get(strokeTuple: string[]): string | null | Promise<string | null>;
  has(strokeTuple: string[]): boolean | Promise<boolean>;
  set(strokeTuple: string[], translation: string): void;
  delete(strokeTuple: string[]): boolean;
  clear(): void;
  update(entries: Iterable<[string[], string]>): void;
  items(): Array<[string[], string]>;
  entries(): Generator<[string[], string]>;
  reverseLookup(translation: string): Set<string[]> | Promise<Set<string[]>>;
  caseReverseLookup(translation: string): Set<string>;
}

export interface StenoDictionaryOptions {
  identifier?: string;
  readonly?: boolean;
  enabled?: boolean;
}

/**
 * A steno dictionary backed by SQLite
 */
export class StenoDictionary implements StenoDictionaryLike {
  private db: DatabaseSync;
  private _identifier: string;
  private _readonly: boolean;
  private _enabled: boolean;
  private _timestamp: number;
  private _longestKey: number;

  constructor(db: DatabaseSync, options: StenoDictionaryOptions = {}) {
    this.db = db;
    this._identifier = options.identifier ?? 'unknown';
    this._readonly = options.readonly ?? false;
    this._enabled = options.enabled ?? true;
    this._timestamp = Date.now();
    this._longestKey = 0;
    
    // Recalculate longest key on init
    this.recalculateLongestKey();
  }

  get identifier(): string {
    return this._identifier;
  }

  set identifier(value: string) {
    this._identifier = value;
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
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM entries WHERE dictionary = ?');
    const result = stmt.get(this._identifier) as { count: number };
    return result.count;
  }

  /**
   * Get a translation by stroke
   */
  get(strokeTuple: string[]): string | null {
    const stroke = strokeTuple.join('/');
    const stmt = this.db.prepare('SELECT translation FROM entries WHERE stroke = ? AND dictionary = ?');
    const result = stmt.get(stroke, this._identifier) as { translation: string } | undefined;
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
    // this.delete(strokeTuple); // No longer needed as INSERT OR REPLACE handles it,
    // but wait, INSERT OR REPLACE on (dictionary, stroke) is sufficient.

    // Insert new entry
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO entries (dictionary, stroke, translation) VALUES (?, ?, ?)'
    );
    stmt.run(this._identifier, stroke, translation);

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
    const stmt = this.db.prepare('DELETE FROM entries WHERE stroke = ? AND dictionary = ?');
    const result = stmt.run(stroke, this._identifier);
    
    // Recalculate longest key if needed
    if (strokeTuple.length === this._longestKey) {
      this.recalculateLongestKey();
    }

    return Number(result.changes ?? 0) > 0;
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
      "SELECT MAX(LENGTH(stroke) - LENGTH(REPLACE(stroke, '/', '')) + 1) as maxLen FROM entries WHERE dictionary = ?"
    );
    const result = stmt.get(this._identifier) as { maxLen: number | null };
    this._longestKey = result.maxLen ?? 0;
  }

  /**
   * Get all entries as an iterator
   */
  *entries(): Generator<[string[], string]> {
    const stmt = this.db.prepare('SELECT stroke, translation FROM entries WHERE dictionary = ?');
    for (const row of stmt.iterate(this._identifier) as Iterable<{ stroke: string; translation: string }>) {
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
    const stmt = this.db.prepare('DELETE FROM entries WHERE dictionary = ?');
    stmt.run(this._identifier);
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
      'INSERT OR REPLACE INTO entries (dictionary, stroke, translation) VALUES (?, ?, ?)'
    );

    // Use a transaction for bulk inserts
    this.db.exec('BEGIN TRANSACTION');
    let longestKey = this._longestKey;
    try {
      for (const [strokeTuple, translation] of entries) {
        const stroke = strokeTuple.join('/');
        insertStmt.run(this._identifier, stroke, translation);
        if (strokeTuple.length > longestKey) {
          longestKey = strokeTuple.length;
        }
      }
      this._longestKey = longestKey;
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
    const stmt = this.db.prepare('SELECT stroke FROM entries WHERE translation = ? AND dictionary = ?');
    const results = stmt.all(translation, this._identifier) as Array<{ stroke: string }>;
    return new Set(results.map(r => r.stroke.split('/')));
  }

  /**
   * Case-insensitive reverse lookup
   */
  caseReverseLookup(translation: string): Set<string> {
    // Note: this query ignores the dictionary filter?
    // Original implementation: SELECT DISTINCT translation FROM entries WHERE LOWER(translation) = LOWER(?)
    // If we have multiple dictionaries in the same table, we should probably filter by dictionary too if we want
    // to strictly scope it to this dictionary.
    // However, caseReverseLookup returns a Set<string> of translations that match case-insensitively.

    const stmt = this.db.prepare(
      'SELECT DISTINCT translation FROM entries WHERE LOWER(translation) = LOWER(?) AND dictionary = ?'
    );
    const results = stmt.all(translation, this._identifier) as Array<{ translation: string }>;
    return new Set(results.map(r => r.translation));
  }

  /**
   * Close the database connection
   */
  close(): void {
    // Shared database connection is closed by the engine
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
  private _dicts: StenoDictionaryLike[] = [];
  private _filters: Array<(key: string[], value: string) => boolean> = [];

  constructor(dicts: StenoDictionaryLike[] = []) {
    this.setDicts(dicts);
  }

  get dicts(): StenoDictionaryLike[] {
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

  setDicts(dicts: StenoDictionaryLike[]): void {
    this._dicts = [...dicts];
  }

  /**
   * Lookup a stroke in all dictionaries (respecting priority)
   */
  async lookup(key: string[]): Promise<string | null> {
    return this._lookup(key, this._filters);
  }

  /**
   * Raw lookup without filters
   */
  async rawLookup(key: string[]): Promise<string | null> {
    return this._lookup(key, []);
  }

  private async _lookupKeepDeleted(
    key: string[],
    dicts?: StenoDictionaryLike[],
    filters: Array<(key: string[], value: string) => boolean> = []
  ): Promise<string | null> {
    const searchDicts = dicts ?? this._dicts;
    const keyLen = key.length;

    if (keyLen > this.longestKey) {
      return null;
    }

    for (const d of searchDicts) {
      if (!d.enabled) continue;
      if (keyLen > d.longestKey) continue;

      const value = await Promise.resolve(d.get(key));
      if (value !== null) {
        // Check filters
        if (!filters.some(f => f(key, value))) {
          return value;
        }
      }
    }

    return null;
  }

  private async _lookup(
    key: string[],
    filters: Array<(key: string[], value: string) => boolean> = []
  ): Promise<string | null> {
    const result = await this._lookupKeepDeleted(key, undefined, filters);
    if (result === null || result.toLowerCase() === '{plover:deleted}') {
      return null;
    }
    return result;
  }

  /**
   * Reverse lookup - find all strokes that produce a translation
   */
  async reverseLookup(translation: string): Promise<Set<string[]>> {
    const keys = new Set<string>();
    const result: string[][] = [];
    
    for (let n = 0; n < this._dicts.length; n++) {
      const d = this._dicts[n];
      if (!d.enabled) continue;

      const reverseResults = await Promise.resolve(d.reverseLookup(translation));
      for (const key of reverseResults) {
        const keyStr = key.join('/');
        // Ignore if overridden by higher priority dictionary
        if (keys.has(keyStr)) continue;
        if (await this._lookupKeepDeleted(key, this._dicts.slice(0, n)) !== null) continue;
        
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
  firstWritable(): StenoDictionaryLike {
    for (const d of this._dicts) {
      if (!d.readonly) {
        return d;
      }
    }
    throw new Error('No writable dictionary');
  }

  /**
   * Get a dictionary by identifier
   */
  get(identifier: string): StenoDictionaryLike | null {
    for (const d of this._dicts) {
      if (d.identifier === identifier) {
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
   * Iterator over dictionary identifiers
   */
  *[Symbol.iterator](): Generator<string> {
    for (const d of this._dicts) {
      yield d.identifier;
    }
  }
}
