/**
 * Shared Steno Core - Runtime-neutral stenography engine
 * 
 * This package provides the core stenography functionality that can be
 * used in any JavaScript runtime (Node.js, browsers, etc.)
 */

// Stroke handling
export {
  Stroke,
  setupStroke,
  getStrokeConfig,
  normalizeStroke,
  normalizeSteno,
  stenoToSortKey,
  sortStenoStrokes,
  type StrokeConfig,
} from './stroke.js';

// Dictionary interfaces
export {
  type IStenoDictionary,
  type IStenoDictionaryCollection,
  type DictionaryInfo,
} from './dictionary-interface.js';

// System configuration
export * as system from './system/index.js';
export {
  KEYS,
  IMPLICIT_HYPHEN_KEYS,
  SUFFIX_KEYS,
  NUMBER_KEY,
  NUMBERS,
  FERAL_NUMBER_KEY,
  UNDO_STROKE_STENO,
  ORTHOGRAPHY_RULES,
  ORTHOGRAPHY_RULES_ALIASES,
  ORTHOGRAPHY_WORDLIST,
  DICTIONARIES_ROOT,
  DEFAULT_DICTIONARIES,
} from './system/english-stenotype.js';

// Plugin registry
export {
  registry,
  type Plugin,
  type PluginType,
} from './registry.js';
