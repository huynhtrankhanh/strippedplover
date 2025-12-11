/**
 * Steno System Module
 * 
 * This module handles steno system setup and configuration.
 */

import { setupStroke, type StrokeConfig } from '../stroke.js';
import * as EnglishStenotype from './english-stenotype.js';

// Current system configuration
let currentSystem: SystemConfig | null = null;

export interface SystemConfig {
  name: string;
  keys: readonly string[];
  keyOrder: Map<string, number>;
  numberKey: string | null;
  numbers: Map<string, string>;
  feralNumberKey: boolean;
  suffixKeys: readonly string[];
  undoStrokeSteno: string;
  implicitHyphenKeys: Set<string>;
  implicitHyphens: Set<string>;
  orthographyWords: Map<string, number>;
  orthographyRules: Array<[RegExp, string]>;
  orthographyRulesAliases: Map<string, string>;
  dictionariesRoot: string;
  defaultDictionaries: readonly string[];
}

// Export current system properties (will be set after setup)
export let NAME: string | null = null;
export let KEYS: readonly string[] = [];
export let KEY_ORDER: Map<string, number> = new Map();
export let NUMBER_KEY: string | null = null;
export let NUMBERS: Map<string, string> = new Map();
export let FERAL_NUMBER_KEY = false;
export let SUFFIX_KEYS: readonly string[] = [];
export let UNDO_STROKE_STENO = '*';
export let IMPLICIT_HYPHEN_KEYS: Set<string> = new Set();
export let IMPLICIT_HYPHENS: Set<string> = new Set();
export let ORTHOGRAPHY_WORDS: Map<string, number> = new Map();
export let ORTHOGRAPHY_RULES: Array<[RegExp, string]> = [];
export let ORTHOGRAPHY_RULES_ALIASES: Map<string, string> = new Map();
export let DICTIONARIES_ROOT = '';
export let DEFAULT_DICTIONARIES: readonly string[] = [];

/**
 * Build key order map from keys and numbers
 */
function buildKeyOrder(keys: readonly string[], numbers: Map<string, string>): Map<string, number> {
  const keyOrder = new Map<string, number>();
  for (let i = 0; i < keys.length; i++) {
    keyOrder.set(keys[i], i);
    const numberKey = numbers.get(keys[i]);
    if (numberKey) {
      keyOrder.set(numberKey, i);
    }
  }
  return keyOrder;
}

/**
 * Load a wordlist file and return as a map of word -> priority
 */
function loadWordlist(_filename: string | null, _assetsDir: string): Map<string, number> {
  // For now, return an empty map - wordlist loading can be implemented later
  // when we have access to the assets directory
  return new Map();
}

/**
 * Setup the steno system
 */
export function setup(systemName: string): void {
  let systemModule: typeof EnglishStenotype;
  
  if (systemName === 'English Stenotype') {
    systemModule = EnglishStenotype;
  } else {
    throw new Error(`Unknown system: ${systemName}`);
  }

  // Build configuration
  const numbers = new Map(Object.entries(systemModule.NUMBERS));
  const keyOrder = buildKeyOrder(systemModule.KEYS, numbers);
  const implicitHyphenKeys = new Set(systemModule.IMPLICIT_HYPHEN_KEYS);
  const implicitHyphens = new Set(
    [...implicitHyphenKeys].map(k => k.replace('-', ''))
  );
  const orthographyRules: Array<[RegExp, string]> = systemModule.ORTHOGRAPHY_RULES.map(
    ([pattern, replacement]) => [new RegExp(pattern, 'i'), replacement]
  );
  const orthographyRulesAliases = new Map(Object.entries(systemModule.ORTHOGRAPHY_RULES_ALIASES));
  const orthographyWords = loadWordlist(systemModule.ORTHOGRAPHY_WORDLIST, systemModule.DICTIONARIES_ROOT);

  // Update module exports
  NAME = systemName;
  KEYS = systemModule.KEYS;
  KEY_ORDER = keyOrder;
  NUMBER_KEY = systemModule.NUMBER_KEY;
  NUMBERS = numbers;
  FERAL_NUMBER_KEY = systemModule.FERAL_NUMBER_KEY;
  SUFFIX_KEYS = systemModule.SUFFIX_KEYS;
  UNDO_STROKE_STENO = systemModule.UNDO_STROKE_STENO;
  IMPLICIT_HYPHEN_KEYS = implicitHyphenKeys;
  IMPLICIT_HYPHENS = implicitHyphens;
  ORTHOGRAPHY_WORDS = orthographyWords;
  ORTHOGRAPHY_RULES = orthographyRules;
  ORTHOGRAPHY_RULES_ALIASES = orthographyRulesAliases;
  DICTIONARIES_ROOT = systemModule.DICTIONARIES_ROOT;
  DEFAULT_DICTIONARIES = systemModule.DEFAULT_DICTIONARIES;

  // Store current system config
  currentSystem = {
    name: systemName,
    keys: KEYS,
    keyOrder: KEY_ORDER,
    numberKey: NUMBER_KEY,
    numbers: NUMBERS,
    feralNumberKey: FERAL_NUMBER_KEY,
    suffixKeys: SUFFIX_KEYS,
    undoStrokeSteno: UNDO_STROKE_STENO,
    implicitHyphenKeys: IMPLICIT_HYPHEN_KEYS,
    implicitHyphens: IMPLICIT_HYPHENS,
    orthographyWords: ORTHOGRAPHY_WORDS,
    orthographyRules: ORTHOGRAPHY_RULES,
    orthographyRulesAliases: ORTHOGRAPHY_RULES_ALIASES,
    dictionariesRoot: DICTIONARIES_ROOT,
    defaultDictionaries: DEFAULT_DICTIONARIES,
  };

  // Setup stroke module
  const strokeConfig: StrokeConfig = {
    keys: KEYS,
    implicitHyphenKeys: IMPLICIT_HYPHEN_KEYS,
    numberKey: NUMBER_KEY,
    numbers: NUMBERS,
    feralNumberKey: FERAL_NUMBER_KEY,
    undoStrokeSteno: UNDO_STROKE_STENO,
  };
  setupStroke(strokeConfig);
}

/**
 * Get current system configuration
 */
export function getCurrentSystem(): SystemConfig {
  if (!currentSystem) {
    throw new Error('System not initialized. Call setup() first.');
  }
  return currentSystem;
}
