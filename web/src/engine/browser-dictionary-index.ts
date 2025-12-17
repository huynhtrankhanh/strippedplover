/**
 * Browser Dictionary Index
 * 
 * Re-exports browser-compatible dictionary implementations.
 */

export { StenoDictionary, StenoDictionaryCollection, type StenoDictionaryLike } from './browser-dictionary';
export { PythonDictionary } from './browser-python-dictionary';

import { StenoDictionary } from './browser-dictionary';

export type DictionaryType = 'json' | 'python';

/**
 * Simple stroke normalization for browser
 */
function normalizeSteno(stroke: string): string[] {
  return stroke.split('/').map(s => s.toUpperCase());
}

/**
 * Create a JSON dictionary from entries data
 */
export function createJsonDictionary(name: string, data: Record<string, string>): StenoDictionary {
  const dict = new StenoDictionary({ path: name });
  
  const entries: Array<[string[], string]> = [];
  for (const [stroke, translation] of Object.entries(data)) {
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

/**
 * Create a new empty dictionary
 */
export function createDictionary(name: string): StenoDictionary {
  return StenoDictionary.create(name);
}

/**
 * Create a Python dictionary - not supported in browser
 */
export async function createPythonDictionary(_name: string, _pythonCode: string): Promise<never> {
  throw new Error('Python dictionaries are not supported in the browser version');
}
