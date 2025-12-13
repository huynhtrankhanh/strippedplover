/**
 * Python Dictionary Module
 * 
 * This module provides a steno dictionary implementation that executes
 * Python dictionary code in a sandboxed WebAssembly environment using Pyodide.
 */

import { loadPyodide, type PyodideInterface } from 'pyodide';
import { readFileSync } from 'node:fs';
import type { BaseDictionary } from './steno-dictionary.js';

export interface PythonDictionaryOptions {
  path?: string;
  enabled?: boolean;
}

/**
 * A steno dictionary backed by Python code running in Pyodide sandbox
 */
export class PythonDictionary implements BaseDictionary {
  private pyodide: PyodideInterface | null = null;
  private _path: string;
  private _readonly: boolean = true; // Python dictionaries are always readonly
  private _enabled: boolean;
  private _timestamp: number;
  private _longestKey: number = 0;
  private _pythonCode: string = '';
  private _initialized: boolean = false;

  constructor(options: PythonDictionaryOptions = {}) {
    this._path = options.path ?? '';
    this._enabled = options.enabled ?? true;
    this._timestamp = Date.now();
  }

  get path(): string {
    return this._path;
  }

  set path(value: string) {
    this._path = value;
  }

  get readonly(): boolean {
    return this._readonly; // Always true for Python dictionaries
  }

  set readonly(_value: boolean) {
    // Python dictionaries are always readonly, ignore setter
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
   * Python dictionaries don't enumerate entries, so this returns 0
   */
  get length(): number {
    return 0; // Python dictionaries don't support enumeration
  }

  /**
   * Get the Python source code
   */
  get pythonCode(): string {
    return this._pythonCode;
  }

  /**
   * Check if the dictionary is initialized
   */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the Pyodide runtime and load the Python code
   */
  async initialize(pythonCode?: string): Promise<void> {
    if (this._initialized && !pythonCode) {
      return;
    }

    // Load Pyodide
    this.pyodide = await loadPyodide();

    // Use provided code or load from file
    if (pythonCode !== undefined) {
      this._pythonCode = pythonCode;
    } else if (this._path) {
      this._pythonCode = readFileSync(this._path, 'utf-8');
    } else {
      throw new Error('Python dictionary requires either source code or a file path to initialize');
    }

    // Execute the Python code in a sandboxed environment
    // The code defines lookup and optionally reverse_lookup functions
    await this.pyodide.runPythonAsync(this._pythonCode);

    // Get LONGEST_KEY
    const longestKey = await this.pyodide.runPythonAsync('LONGEST_KEY');
    if (typeof longestKey !== 'number' || longestKey <= 0) {
      throw new Error(`Missing or invalid LONGEST_KEY constant: ${longestKey}`);
    }
    this._longestKey = longestKey;

    // Verify lookup function exists
    const hasLookup = await this.pyodide.runPythonAsync("callable(lookup) if 'lookup' in dir() else False");
    if (!hasLookup) {
      throw new Error('Missing or invalid lookup function');
    }

    this._initialized = true;
  }

  /**
   * Get a translation by stroke
   */
  get(strokeTuple: string[]): string | null {
    if (!this._initialized || !this.pyodide) {
      return null;
    }

    if (strokeTuple.length > this._longestKey) {
      return null;
    }

    try {
      // Convert stroke tuple to Python tuple and call lookup
      const strokeJson = JSON.stringify(strokeTuple);
      const result = this.pyodide.runPython(`
try:
    result = lookup(tuple(${strokeJson}))
except KeyError:
    result = None
result
`);
      return result ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Set a translation for a stroke - not supported for Python dictionaries
   */
  set(_strokeTuple: string[], _translation: string): void {
    throw new Error('Python dictionaries are read-only');
  }

  /**
   * Delete an entry by stroke - not supported for Python dictionaries
   */
  delete(_strokeTuple: string[]): boolean {
    throw new Error('Python dictionaries are read-only');
  }

  /**
   * Check if a stroke exists in the dictionary
   */
  has(strokeTuple: string[]): boolean {
    return this.get(strokeTuple) !== null;
  }

  /**
   * Get all entries as an iterator - not supported for Python dictionaries
   */
  *entries(): Generator<[string[], string]> {
    // Python dictionaries don't support enumeration
  }

  /**
   * Get all entries as an array - not supported for Python dictionaries
   */
  items(): Array<[string[], string]> {
    return [];
  }

  /**
   * Clear all entries - not supported for Python dictionaries
   */
  clear(): void {
    throw new Error('Python dictionaries are read-only');
  }

  /**
   * Update dictionary with entries - not supported for Python dictionaries
   */
  update(_entries: Iterable<[string[], string]>): void {
    throw new Error('Python dictionaries are read-only');
  }

  /**
   * Reverse lookup - find all strokes that produce a translation
   */
  reverseLookup(translation: string): Set<string[]> {
    if (!this._initialized || !this.pyodide) {
      return new Set();
    }

    try {
      // Check if reverse_lookup is defined and call it
      const hasReverseLookup = this.pyodide.runPython(
        "callable(reverse_lookup) if 'reverse_lookup' in dir() else False"
      );

      if (!hasReverseLookup) {
        return new Set();
      }

      const resultJson = this.pyodide.runPython(`
import json
try:
    result = reverse_lookup(${JSON.stringify(translation)})
    # Convert to list of lists for JSON serialization
    json.dumps([list(s) for s in result])
except Exception:
    "[]"
`);

      const strokes: string[][] = JSON.parse(resultJson);
      return new Set(strokes);
    } catch {
      return new Set();
    }
  }

  /**
   * Case-insensitive reverse lookup - not supported for Python dictionaries
   */
  caseReverseLookup(_translation: string): Set<string> {
    return new Set();
  }

  /**
   * Close and cleanup resources
   */
  close(): void {
    // Pyodide doesn't have a close method, but we can clear the reference
    this.pyodide = null;
    this._initialized = false;
  }

  /**
   * Export dictionary to JSON format - returns empty object
   * Python dictionaries don't support enumeration
   */
  toJson(): Record<string, string> {
    return {};
  }

  /**
   * Create a new Python dictionary from source code
   */
  static async createFromSource(path: string, pythonCode: string): Promise<PythonDictionary> {
    const dict = new PythonDictionary({ path });
    await dict.initialize(pythonCode);
    return dict;
  }

  /**
   * Load a Python dictionary from a file
   */
  static async loadFromFile(path: string): Promise<PythonDictionary> {
    const dict = new PythonDictionary({ path });
    await dict.initialize();
    return dict;
  }
}
