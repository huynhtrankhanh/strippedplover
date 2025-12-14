import { StenoDictionary, StenoDictionaryLike } from './steno-dictionary.js';
import { normalizeSteno } from '../stroke.js';
import { PythonDictionary } from './python-dictionary.js';

export type DictionaryFormat = 'json' | 'python';

export interface DictionaryPayload {
  path: string;
  data?: Record<string, string>;
  format?: DictionaryFormat;
}

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
export function loadJsonDictionary(payload: DictionaryPayload): StenoDictionary {
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
  const format = payload.format ?? (payload.path.toLowerCase().endsWith('.py') ? 'python' : 'json');
  const data = payload.data ?? {};

  switch (format) {
    case 'python':
      return PythonDictionary.fromData(data, { path: payload.path });
    case 'json':
      return loadJsonDictionary({ ...payload, data });
    default:
      throw new Error(`Unsupported dictionary format: ${format}`);
  }
}
