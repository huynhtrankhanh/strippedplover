import { StenoDictionary, StenoDictionaryLike } from './steno-dictionary.js';
import { normalizeSteno } from '../stroke.js';

type PythonDictionaryInput = Record<string, string> | Array<[string[], string]>;

/**
 * PythonDictionary is now a thin SQLite-backed wrapper that keeps parity with
 * the StenoDictionaryLike interface while remaining read-only.
 */
export class PythonDictionary implements StenoDictionaryLike {
  private store: StenoDictionary;
  readonly = true;
  enabled: boolean;

  private constructor(store: StenoDictionary, enabled = true) {
    this.store = store;
    this.enabled = enabled;
    this.store.readonly = true;
  }

  /**
   * Create a PythonDictionary from raw entries without touching the filesystem.
   */
  static fromData(data: PythonDictionaryInput, options: { path?: string; enabled?: boolean } = {}): PythonDictionary {
    const path = options.path ?? ':memory:';
    const enabled = options.enabled ?? true;
    const dict = new StenoDictionary({ path, readonly: false, enabled });

    const entries: Array<[string[], string]> = Array.isArray(data)
      ? data
      : Object.entries(data).map(([stroke, translation]) => [normalizeSteno(stroke, false), translation]);

    if (entries.length > 0) {
      dict.update(entries);
    }

    dict.readonly = true;

    return new PythonDictionary(dict, enabled);
  }

  /**
   * Async alias for fromData to preserve previous API shape.
   */
  static async load(data: PythonDictionaryInput, options?: { path?: string; enabled?: boolean }): Promise<PythonDictionary> {
    return PythonDictionary.fromData(data, options);
  }

  get path(): string {
    return this.store.path;
  }

  set path(value: string) {
    this.store.path = value;
  }

  get longestKey(): number {
    return this.store.longestKey;
  }

  get length(): number {
    return this.store.length;
  }

  get(strokeTuple: string[]): string | null {
    return this.store.get(strokeTuple);
  }

  async has(strokeTuple: string[]): Promise<boolean> {
    return this.store.has(strokeTuple);
  }

  set(_strokeTuple: string[], _translation: string): void {
    throw new Error('Unsupported operation: Python dictionary is read-only');
  }

  delete(_strokeTuple: string[]): boolean {
    throw new Error('Unsupported operation: Python dictionary is read-only');
  }

  clear(): void {
    throw new Error('Unsupported operation: Python dictionary is read-only');
  }

  update(_entries: Iterable<[string[], string]>): void {
    throw new Error('Unsupported operation: Python dictionary is read-only');
  }

  *entries(): Generator<[string[], string]> {
    yield* this.store.entries();
  }

  items(): Array<[string[], string]> {
    return this.store.items();
  }

  async reverseLookup(translation: string): Promise<Set<string[]>> {
    return this.store.reverseLookup(translation);
  }

  caseReverseLookup(translation: string): Set<string> {
    return this.store.caseReverseLookup(translation);
  }

  /**
   * No-op for compatibility with previous API.
   */
  terminate(): void {
    // Nothing to clean up when using SQLite-backed storage.
  }
}
