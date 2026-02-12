/**
 * Dictionary Loading Module
 * 
 * Handles creating dictionaries from in-memory data (no filesystem access).
 * All dictionary data is stored in SQLite and passed via the RPC protocol.
 */

import { DatabaseSync } from '../lmdb-database.js';
import { StenoDictionary, StenoDictionaryLike } from './steno-dictionary.js';
import { normalizeSteno } from '../stroke.js';
import { PythonDictionary } from './python-dictionary.js';

/**
 * Dictionary type for explicit declaration in RPC protocol
 */
export type DictionaryType = 'json' | 'python';

/**
 * Create a JSON dictionary from entries data
 */
export function createJsonDictionary(name: string, data: Record<string, string>, db: DatabaseSync): StenoDictionary {
  const dict = new StenoDictionary(db, { identifier: name });
  
  // Convert entries with stroke normalization
  function* normalizedEntries(): Generator<[string[], string]> {
    for (const [stroke, translation] of Object.entries(data)) {
      try {
        yield [normalizeSteno(stroke, false), translation];
      } catch {
        // If normalization fails, use raw stroke
        yield [stroke.split('/'), translation];
      }
    }
  }

  dict.update(normalizedEntries());
  return dict;
}

/**
 * Create a new empty dictionary
 */
export function createDictionary(name: string, db: DatabaseSync): StenoDictionary {
  return new StenoDictionary(db, { identifier: name, readonly: false });
}

/**
 * Create a Python dictionary from Python code
 */
export async function createPythonDictionary(name: string, pythonCode: string): Promise<PythonDictionary> {
  return PythonDictionary.loadFromCode(name, pythonCode);
}
