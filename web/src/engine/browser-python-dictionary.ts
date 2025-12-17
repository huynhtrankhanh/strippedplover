/**
 * Browser Python Dictionary Stub
 * 
 * Python dictionaries are not supported in the browser version.
 * This provides a stub implementation that throws appropriate errors.
 */

import type { StenoDictionaryLike } from './browser-dictionary';

/**
 * Python Dictionary stub for browser - not supported
 */
export class PythonDictionary implements StenoDictionaryLike {
  private _path: string;
  readonly = true;
  enabled = false;

  private constructor(name: string) {
    this._path = name;
  }

  static async loadFromCode(name: string, _pythonCode: string): Promise<PythonDictionary> {
    console.warn('Python dictionaries are not supported in the browser version');
    return new PythonDictionary(name);
  }

  get pythonCode(): string {
    return '';
  }

  get path(): string {
    return this._path;
  }

  set path(value: string) {
    this._path = value;
  }

  get longestKey(): number {
    return 0;
  }

  get length(): number {
    return 0;
  }

  get(_strokeTuple: string[]): string | null {
    return null;
  }

  has(_strokeTuple: string[]): boolean {
    return false;
  }

  set(_strokeTuple: string[], _translation: string): void {
    throw new Error('Python dictionaries are not supported in the browser');
  }

  delete(_strokeTuple: string[]): boolean {
    throw new Error('Python dictionaries are not supported in the browser');
  }

  clear(): void {
    throw new Error('Python dictionaries are not supported in the browser');
  }

  update(_entries: Iterable<[string[], string]>): void {
    throw new Error('Python dictionaries are not supported in the browser');
  }

  *entries(): Generator<[string[], string]> {
    // Empty generator
  }

  items(): Array<[string[], string]> {
    return [];
  }

  reverseLookup(_translation: string): Set<string[]> {
    return new Set();
  }

  caseReverseLookup(_translation: string): Set<string> {
    return new Set();
  }

  terminate(): void {
    // No-op
  }
}
