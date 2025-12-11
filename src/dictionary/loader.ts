/**
 * Dictionary Loading Module
 * 
 * Handles loading dictionaries from JSON files.
 */

import { readFileSync } from 'node:fs';
import { StenoDictionary } from './steno-dictionary.js';
import { normalizeSteno } from '../stroke.js';

/**
 * Load a dictionary from a JSON file
 */
export function loadJsonDictionary(path: string): StenoDictionary {
  const content = readFileSync(path, 'utf-8');
  const json = JSON.parse(content) as Record<string, string>;
  
  const dict = new StenoDictionary({ path });
  
  // Convert entries with stroke normalization
  const entries: Array<[string[], string]> = [];
  for (const [stroke, translation] of Object.entries(json)) {
    try {
      const normalizedStroke = normalizeSteno(stroke, false);
      entries.push([normalizedStroke, translation]);
    } catch {
      // If normalization fails, use raw stroke
      entries.push([stroke.split('/'), translation]);
    }
  }
  
  dict.update(entries);
  return dict;
}

/**
 * Create a new empty dictionary
 */
export function createDictionary(path: string): StenoDictionary {
  return StenoDictionary.create(path);
}

/**
 * Load a dictionary from a file (auto-detect format from extension)
 */
export function loadDictionary(path: string): StenoDictionary {
  const extension = path.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'json':
      return loadJsonDictionary(path);
    default:
      throw new Error(`Unsupported dictionary format: ${extension}`);
  }
}

/**
 * Save a dictionary to a JSON file
 */
export function saveDictionaryToJson(dict: StenoDictionary, path: string): void {
  const { writeFileSync } = require('node:fs');
  
  // Get all entries and sort by stroke
  const entries = dict.items();
  entries.sort((a, b) => {
    const aKey = a[0].join('/');
    const bKey = b[0].join('/');
    return aKey.localeCompare(bKey);
  });
  
  // Convert to JSON object
  const json: Record<string, string> = {};
  for (const [stroke, translation] of entries) {
    json[stroke.join('/')] = translation;
  }
  
  // Write with pretty formatting
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf-8');
}
