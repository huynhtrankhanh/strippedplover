import { StenoDictionary, StenoDictionaryLike } from './steno-dictionary.js';
import { normalizeSteno } from '../stroke.js';
import { PythonDictionary, buildPythonDictionarySource } from './python-dictionary.js';

export type DictionaryFormat = 'json' | 'python';
export type JsonDictionaryPayload = {
  path: string;
  data: Record<string, string>;
  format?: 'json';
  code?: never;
};
export type PythonDictionaryPayload = {
  path: string;
  code: string;
  format: 'python';
  data?: never;
};

export type DictionaryPayload = JsonDictionaryPayload | PythonDictionaryPayload;

function normalizeEntries(data: Record<string, string>): Array<[string[], string]> {
  const entries: Array<[string[], string]> = [];
  for (const [stroke, translation] of Object.entries(data)) {
    entries.push([normalizeSteno(stroke, false), translation]);
  }
  return entries;
}

/**
 * Load a dictionary into SQLite from provided data.
 */
export function loadJsonDictionary(payload: JsonDictionaryPayload): StenoDictionary {
  const dict = new StenoDictionary({ path: payload.path });
  if (payload.data) {
    dict.update(normalizeEntries(payload.data));
  }
  return dict;
}

/**
 * Create a new empty dictionary
 */
export function createDictionary(path: string): StenoDictionary {
  return StenoDictionary.create(path);
}

/**
 * Load a dictionary based on format, without touching the filesystem.
 */
export async function loadDictionary(payload: DictionaryPayload): Promise<StenoDictionaryLike> {
  if (payload.format === 'python') {
    return PythonDictionary.loadFromCode(payload.code, { path: payload.path });
  }

  return loadJsonDictionary(payload);
}
