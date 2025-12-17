/**
 * Dictionary Interface - Runtime-neutral dictionary abstractions
 * 
 * These interfaces define the contract for dictionary implementations
 * that can be provided by different platforms (Node.js, browser, etc.)
 */

/**
 * A single steno dictionary
 */
export interface IStenoDictionary {
  readonly path: string;
  readonly readonly: boolean;
  enabled: boolean;
  readonly longestKey: number;
  readonly length: number;
  
  /**
   * Get a translation by stroke tuple
   */
  get(strokeTuple: string[]): string | null | Promise<string | null>;
  
  /**
   * Check if a stroke tuple exists
   */
  has(strokeTuple: string[]): boolean | Promise<boolean>;
  
  /**
   * Set a translation (throws if readonly)
   */
  set(strokeTuple: string[], translation: string): void;
  
  /**
   * Delete an entry (throws if readonly)
   */
  delete(strokeTuple: string[]): boolean;
  
  /**
   * Clear all entries (throws if readonly)
   */
  clear(): void;
  
  /**
   * Update with multiple entries (throws if readonly)
   */
  update(entries: Iterable<[string[], string]>): void;
  
  /**
   * Get all entries as an array
   */
  items(): Array<[string[], string]>;
  
  /**
   * Get entries as a generator
   */
  entries(): Generator<[string[], string]>;
  
  /**
   * Reverse lookup - find strokes that produce a translation
   */
  reverseLookup(translation: string): Set<string[]> | Promise<Set<string[]>>;
  
  /**
   * Case-insensitive reverse lookup
   */
  caseReverseLookup(translation: string): Set<string>;
}

/**
 * A collection of steno dictionaries with priority ordering
 */
export interface IStenoDictionaryCollection {
  readonly dicts: IStenoDictionary[];
  readonly longestKey: number;
  
  /**
   * Set the dictionaries in priority order
   */
  setDicts(dicts: IStenoDictionary[]): void;
  
  /**
   * Lookup a stroke in all enabled dictionaries
   */
  lookup(key: string[]): Promise<string | null>;
  
  /**
   * Raw lookup without filters
   */
  rawLookup(key: string[]): Promise<string | null>;
  
  /**
   * Reverse lookup across all enabled dictionaries
   */
  reverseLookup(translation: string): Promise<Set<string[]>>;
  
  /**
   * Case-insensitive reverse lookup
   */
  caseReverseLookup(translation: string): Set<string>;
  
  /**
   * Get the first writable dictionary
   */
  firstWritable(): IStenoDictionary;
  
  /**
   * Get a dictionary by path
   */
  get(path: string): IStenoDictionary | null;
  
  /**
   * Add a filter function
   */
  addFilter(f: (key: string[], value: string) => boolean): void;
  
  /**
   * Remove a filter function
   */
  removeFilter(f: (key: string[], value: string) => boolean): void;
}

/**
 * Dictionary info for display purposes
 */
export interface DictionaryInfo {
  path: string;
  enabled: boolean;
  readonly: boolean;
  entries: number;
}
