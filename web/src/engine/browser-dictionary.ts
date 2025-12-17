/**
 * Browser-compatible Steno Dictionary
 * 
 * Uses in-memory Map storage instead of SQLite for browser compatibility.
 * This is a drop-in replacement for the Node.js SQLite-backed StenoDictionary.
 */

export interface StenoDictionaryLike {
  path: string;
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
  path?: string;
  readonly?: boolean;
  enabled?: boolean;
}

/**
 * Simple stroke normalization for browser
 */
function normalizeSteno(stroke: string): string[] {
  // Simple normalization - just split by / and uppercase
  return stroke.split('/').map(s => s.toUpperCase());
}

/**
 * A steno dictionary backed by in-memory Map (browser-compatible)
 */
export class StenoDictionary implements StenoDictionaryLike {
  private _entries: Map<string, string>;
  private _reverseIndex: Map<string, Set<string>>;
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
    this._entries = new Map();
    this._reverseIndex = new Map();
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

  get length(): number {
    return this._entries.size;
  }

  get(strokeTuple: string[]): string | null {
    const stroke = strokeTuple.join('/');
    return this._entries.get(stroke) ?? null;
  }

  set(strokeTuple: string[], translation: string): void {
    if (this._readonly) {
      throw new Error('Dictionary is read-only');
    }

    const stroke = strokeTuple.join('/');
    
    // Remove from old reverse index if exists
    const oldTranslation = this._entries.get(stroke);
    if (oldTranslation !== undefined) {
      const oldSet = this._reverseIndex.get(oldTranslation);
      if (oldSet) {
        oldSet.delete(stroke);
        if (oldSet.size === 0) {
          this._reverseIndex.delete(oldTranslation);
        }
      }
    }

    // Add new entry
    this._entries.set(stroke, translation);

    // Add to reverse index
    if (!this._reverseIndex.has(translation)) {
      this._reverseIndex.set(translation, new Set());
    }
    this._reverseIndex.get(translation)!.add(stroke);

    // Update longest key
    if (strokeTuple.length > this._longestKey) {
      this._longestKey = strokeTuple.length;
    }
  }

  delete(strokeTuple: string[]): boolean {
    if (this._readonly) {
      throw new Error('Dictionary is read-only');
    }

    const stroke = strokeTuple.join('/');
    const translation = this._entries.get(stroke);
    
    if (translation === undefined) {
      return false;
    }

    // Remove from reverse index
    const reverseSet = this._reverseIndex.get(translation);
    if (reverseSet) {
      reverseSet.delete(stroke);
      if (reverseSet.size === 0) {
        this._reverseIndex.delete(translation);
      }
    }

    this._entries.delete(stroke);

    // Recalculate longest key if needed
    if (strokeTuple.length === this._longestKey) {
      this.recalculateLongestKey();
    }

    return true;
  }

  has(strokeTuple: string[]): boolean {
    return this.get(strokeTuple) !== null;
  }

  private recalculateLongestKey(): void {
    this._longestKey = 0;
    for (const stroke of this._entries.keys()) {
      const len = stroke.split('/').length;
      if (len > this._longestKey) {
        this._longestKey = len;
      }
    }
  }

  *entries(): Generator<[string[], string]> {
    for (const [stroke, translation] of this._entries) {
      yield [stroke.split('/'), translation];
    }
  }

  items(): Array<[string[], string]> {
    return [...this.entries()];
  }

  clear(): void {
    if (this._readonly) {
      throw new Error('Dictionary is read-only');
    }
    this._entries.clear();
    this._reverseIndex.clear();
    this._longestKey = 0;
  }

  update(entries: Iterable<[string[], string]>): void {
    if (this._readonly) {
      throw new Error('Dictionary is read-only');
    }

    for (const [strokeTuple, translation] of entries) {
      const stroke = strokeTuple.join('/');
      
      // Remove from old reverse index if exists
      const oldTranslation = this._entries.get(stroke);
      if (oldTranslation !== undefined) {
        const oldSet = this._reverseIndex.get(oldTranslation);
        if (oldSet) {
          oldSet.delete(stroke);
          if (oldSet.size === 0) {
            this._reverseIndex.delete(oldTranslation);
          }
        }
      }

      // Add entry
      this._entries.set(stroke, translation);

      // Add to reverse index
      if (!this._reverseIndex.has(translation)) {
        this._reverseIndex.set(translation, new Set());
      }
      this._reverseIndex.get(translation)!.add(stroke);

      if (strokeTuple.length > this._longestKey) {
        this._longestKey = strokeTuple.length;
      }
    }
  }

  reverseLookup(translation: string): Set<string[]> {
    const strokes = this._reverseIndex.get(translation);
    if (!strokes) {
      return new Set();
    }
    return new Set([...strokes].map(s => s.split('/')));
  }

  caseReverseLookup(translation: string): Set<string> {
    const lowerTranslation = translation.toLowerCase();
    const results = new Set<string>();
    
    for (const [trans] of this._reverseIndex) {
      if (trans.toLowerCase() === lowerTranslation) {
        results.add(trans);
      }
    }
    
    return results;
  }

  close(): void {
    // No-op for in-memory dictionary
  }

  static create(path: string): StenoDictionary {
    return new StenoDictionary({ path, readonly: false });
  }

  static loadFromJson(path: string, jsonContent: Record<string, string>): StenoDictionary {
    const dict = new StenoDictionary({ path });
    
    const entries: Array<[string[], string]> = [];
    for (const [stroke, translation] of Object.entries(jsonContent)) {
      try {
        const normalizedStroke = normalizeSteno(stroke);
        entries.push([normalizedStroke, translation]);
      } catch {
        entries.push([stroke.split('/'), translation]);
      }
    }
    
    dict.update(entries);
    return dict;
  }

  toJson(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [stroke, translation] of this._entries) {
      result[stroke] = translation;
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

  async lookup(key: string[]): Promise<string | null> {
    return this._lookup(key, this._filters);
  }

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

  async reverseLookup(translation: string): Promise<Set<string[]>> {
    const keys = new Set<string>();
    const result: string[][] = [];
    
    for (let n = 0; n < this._dicts.length; n++) {
      const d = this._dicts[n];
      if (!d.enabled) continue;

      const reverseResults = await Promise.resolve(d.reverseLookup(translation));
      for (const key of reverseResults) {
        const keyStr = key.join('/');
        if (keys.has(keyStr)) continue;
        if (await this._lookupKeepDeleted(key, this._dicts.slice(0, n)) !== null) continue;
        
        keys.add(keyStr);
        result.push(key);
      }
    }

    return new Set(result);
  }

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

  firstWritable(): StenoDictionaryLike {
    for (const d of this._dicts) {
      if (!d.readonly) {
        return d;
      }
    }
    throw new Error('No writable dictionary');
  }

  get(path: string): StenoDictionaryLike | null {
    for (const d of this._dicts) {
      if (d.path === path) {
        return d;
      }
    }
    return null;
  }

  addFilter(f: (key: string[], value: string) => boolean): void {
    this._filters.push(f);
  }

  removeFilter(f: (key: string[], value: string) => boolean): void {
    const idx = this._filters.indexOf(f);
    if (idx !== -1) {
      this._filters.splice(idx, 1);
    }
  }

  *[Symbol.iterator](): Generator<string> {
    for (const d of this._dicts) {
      yield d.path;
    }
  }
}
