/**
 * Stroke - A TypeScript implementation of steno stroke handling
 * 
 * This module provides stroke parsing, normalization, and manipulation
 * for stenography. It's a pure TypeScript port of the plover_stroke
 * C extension functionality.
 */

export interface StrokeConfig {
  keys: readonly string[];
  implicitHyphenKeys: Set<string>;
  numberKey: string | null;
  numbers: Map<string, string>;
  feralNumberKey: boolean;
  undoStrokeSteno: string;
}

// Global configuration - set by system.setup()
let config: StrokeConfig | null = null;
let keyOrder: Map<string, number> = new Map();
let reverseNumbers: Map<string, string> = new Map();
let implicitHyphens: Set<string> = new Set();

/**
 * Setup the stroke system with the given configuration
 */
export function setupStroke(cfg: StrokeConfig): void {
  config = cfg;
  
  // Build key order map
  keyOrder = new Map();
  for (let i = 0; i < cfg.keys.length; i++) {
    keyOrder.set(cfg.keys[i], i);
    const numberKey = cfg.numbers.get(cfg.keys[i]);
    if (numberKey) {
      keyOrder.set(numberKey, i);
    }
  }
  
  // Build reverse numbers map
  reverseNumbers = new Map();
  for (const [key, num] of cfg.numbers) {
    reverseNumbers.set(num, key);
  }
  
  // Build implicit hyphens set (without the hyphen)
  implicitHyphens = new Set();
  for (const key of cfg.implicitHyphenKeys) {
    implicitHyphens.add(key.replace('-', ''));
  }
}

/**
 * Get the current stroke configuration
 */
export function getStrokeConfig(): StrokeConfig {
  if (!config) {
    throw new Error('Stroke system not initialized. Call setupStroke() first.');
  }
  return config;
}

/**
 * Represents a stenotype stroke as an integer bitmask
 */
export class Stroke {
  private _value: number;
  private _rtfcre: string | null = null;
  private _keys: string[] | null = null;

  constructor(value: number | string | string[]) {
    if (typeof value === 'number') {
      this._value = value;
    } else if (typeof value === 'string') {
      this._value = Stroke.fromSteno(value)._value;
    } else if (Array.isArray(value)) {
      this._value = Stroke.fromKeys(value)._value;
    } else {
      throw new Error('Invalid stroke value');
    }
  }

  /**
   * Get the integer value of the stroke
   */
  get value(): number {
    return this._value;
  }

  /**
   * Get the RTFCRE string representation
   */
  get rtfcre(): string {
    if (this._rtfcre === null) {
      this._rtfcre = strokeToSteno(this._value);
    }
    return this._rtfcre;
  }

  /**
   * Get the steno keys in this stroke
   */
  get stenoKeys(): string[] {
    if (this._keys === null) {
      this._keys = strokeToKeys(this._value);
    }
    return this._keys;
  }

  /**
   * Check if this is an undo/correction stroke
   */
  get isCorrection(): boolean {
    const cfg = getStrokeConfig();
    const undoStroke = Stroke.fromSteno(cfg.undoStrokeSteno);
    return this._value === undoStroke._value;
  }

  /**
   * Get the number of keys in this stroke
   */
  get length(): number {
    return this.stenoKeys.length;
  }

  /**
   * Create a stroke from steno notation
   */
  static fromSteno(steno: string): Stroke {
    return new Stroke(strokeFromSteno(steno));
  }

  /**
   * Create a stroke from a list of keys
   */
  static fromKeys(keys: string[]): Stroke {
    return new Stroke(strokeFromKeys(keys));
  }

  /**
   * Create a stroke from an integer
   */
  static fromInteger(value: number): Stroke {
    return new Stroke(value);
  }

  /**
   * Normalize a single stroke string
   */
  static normalizeStroke(steno: string, strict = true): string {
    try {
      return Stroke.fromSteno(steno).rtfcre;
    } catch (e) {
      if (strict) throw e;
      return steno;
    }
  }

  /**
   * Normalize a steno outline (potentially multi-stroke)
   */
  static normalizeSteno(steno: string, strict = true): string[] {
    try {
      return steno.split('/').map(s => Stroke.normalizeStroke(s, strict));
    } catch (e) {
      if (strict) throw e;
      return steno.split('/');
    }
  }

  /**
   * Get a sort key for a steno outline
   */
  static stenoToSortKey(steno: string, strict = true): string {
    try {
      const strokes = steno.split('/').map(s => Stroke.fromSteno(s));
      // Create a sortable string based on stroke values
      return strokes.map(s => s._value.toString(16).padStart(8, '0')).join('');
    } catch (e) {
      if (strict) throw e;
      // Fallback: prefix with null bytes to sort after valid strokes
      return '\x00\x00' + steno;
    }
  }

  /**
   * The prefix stroke (empty stroke)
   */
  static get PREFIX_STROKE(): Stroke {
    return new Stroke(0);
  }

  /**
   * The undo stroke
   */
  static get UNDO_STROKE(): Stroke {
    const cfg = getStrokeConfig();
    return Stroke.fromSteno(cfg.undoStrokeSteno);
  }

  /**
   * Check if this stroke contains another stroke (bitwise)
   */
  contains(other: Stroke): boolean {
    return (this._value & other._value) === other._value;
  }

  /**
   * Subtract another stroke (bitwise)
   */
  subtract(other: Stroke): Stroke {
    return new Stroke(this._value & ~other._value);
  }

  /**
   * Combine with another stroke (bitwise OR)
   */
  combine(other: Stroke): Stroke {
    return new Stroke(this._value | other._value);
  }

  /**
   * Check equality
   */
  equals(other: Stroke): boolean {
    return this._value === other._value;
  }

  /**
   * Get iterator over keys
   */
  keys(): string[] {
    return this.stenoKeys;
  }

  toString(): string {
    const prefix = this.isCorrection ? '*' : '';
    return `${prefix}Stroke(${this.rtfcre} : ${this.stenoKeys.join(', ')})`;
  }
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Parse a steno string into a bitmask
 */
function strokeFromSteno(steno: string): number {
  const cfg = getStrokeConfig();
  
  if (!steno) {
    return 0;
  }

  const keys: string[] = [];
  let remaining = steno;
  
  // Handle number key prefix
  // Numeric aliases are themselves an RTFCRE representation of the number
  // bar.  The serializer normally omits `#` when at least one alias is
  // present, so detect them before parsing the individual keys.
  let hasNumber = cfg.numberKey !== null && [...cfg.numbers.values()].some(
    number => steno.includes(number.replace('-', ''))
  );
  if (cfg.numberKey) {
    const numberKey = cfg.numberKey.replace('-', '');
    const firstNumberKeyIndex = remaining.indexOf(numberKey);
    if (firstNumberKeyIndex !== -1) {
      const secondNumberKeyIndex = remaining.indexOf(
        numberKey,
        firstNumberKeyIndex + numberKey.length,
      );
      if (secondNumberKeyIndex !== -1) {
        throw new Error(`Duplicate number key: ${steno}`);
      }
      if (firstNumberKeyIndex !== 0 && !cfg.feralNumberKey) {
        throw new Error(`Number key must be leading: ${steno}`);
      }
      hasNumber = true;
      remaining =
        remaining.slice(0, firstNumberKeyIndex) +
        remaining.slice(firstNumberKeyIndex + numberKey.length);
    }
  }
  
  // Check for explicit hyphen to determine left/right boundary
  const hyphenIndex = remaining.indexOf('-');
  const hasExplicitHyphen = hyphenIndex !== -1;
  
  // Find implicit hyphen position if no explicit hyphen
  let implicitHyphenPos = -1;
  if (!hasExplicitHyphen) {
    for (let i = 0; i < remaining.length; i++) {
      for (const implKey of cfg.implicitHyphenKeys) {
        const keyChar = implKey.replace('-', '');
        if (remaining.slice(i).startsWith(keyChar)) {
          implicitHyphenPos = i;
          break;
        }
      }
      if (implicitHyphenPos !== -1) break;

      // A numeric alias for a vowel or right-hand key establishes the same
      // boundary as the underlying steno key.
      if (hasNumber) {
        for (const [key, number] of cfg.numbers) {
          if ((cfg.implicitHyphenKeys.has(key) || key.startsWith('-')) &&
              remaining.slice(i).startsWith(number.replace('-', ''))) {
            implicitHyphenPos = i;
            break;
          }
        }
      }
      if (implicitHyphenPos !== -1) break;
    }
  }
  
  // Determine the boundary position
  const boundaryPos = hasExplicitHyphen ? hyphenIndex : implicitHyphenPos;
  
  // Build list of left-hand keys (before boundary)
  const leftPart = boundaryPos === -1 ? remaining : remaining.slice(0, boundaryPos);
  
  // Build list of right-hand keys (after boundary)
  let rightPart = '';
  if (hasExplicitHyphen) {
    rightPart = remaining.slice(hyphenIndex + 1);
  } else if (implicitHyphenPos !== -1) {
    rightPart = remaining.slice(implicitHyphenPos);
  }
  
  // Parse left-hand keys
  let leftRemaining = leftPart;
  while (leftRemaining.length > 0) {
    let matched = false;
    
    // Try to match left-hand keys (keys ending with - or without hyphen that are left)
    for (const key of cfg.keys) {
      // Skip right-hand keys
      if (key.startsWith('-')) continue;
      
      const keyChar = key.replace('-', '');
      if (leftRemaining.startsWith(keyChar)) {
        // Check for number substitution
        if (hasNumber && cfg.numbers.has(key)) {
          const numChar = cfg.numbers.get(key)!.replace('-', '');
          if (leftRemaining.startsWith(numChar)) {
            keys.push(key);
            leftRemaining = leftRemaining.slice(numChar.length);
            matched = true;
            break;
          }
        }
        
        keys.push(key);
        leftRemaining = leftRemaining.slice(keyChar.length);
        matched = true;
        break;
      }
      
      // Also check for number character
      if (hasNumber && cfg.numbers.has(key)) {
        const numChar = cfg.numbers.get(key)!.replace('-', '');
        if (leftRemaining.startsWith(numChar)) {
          keys.push(key);
          leftRemaining = leftRemaining.slice(numChar.length);
          matched = true;
          break;
        }
      }
    }
    
    if (!matched) {
      // Skip unknown character
      leftRemaining = leftRemaining.slice(1);
    }
  }
  
  // Parse right-hand keys (including implicit hyphen keys)
  let rightRemaining = rightPart;
  while (rightRemaining.length > 0) {
    let matched = false;
    
    for (const key of cfg.keys) {
      const keyChar = key.replace('-', '');
      
      // Match implicit hyphen keys or right-hand keys
      if (cfg.implicitHyphenKeys.has(key) || key.startsWith('-')) {
        if (rightRemaining.startsWith(keyChar)) {
          // Check for number substitution
          if (hasNumber && cfg.numbers.has(key)) {
            const numChar = cfg.numbers.get(key)!.replace('-', '');
            if (rightRemaining.startsWith(numChar)) {
              keys.push(key);
              rightRemaining = rightRemaining.slice(numChar.length);
              matched = true;
              break;
            }
          }
          
          if (!keys.includes(key)) {
            keys.push(key);
          }
          rightRemaining = rightRemaining.slice(keyChar.length);
          matched = true;
          break;
        }
        
        // Also check for number character
        if (hasNumber && cfg.numbers.has(key)) {
          const numChar = cfg.numbers.get(key)!.replace('-', '');
          if (rightRemaining.startsWith(numChar)) {
            keys.push(key);
            rightRemaining = rightRemaining.slice(numChar.length);
            matched = true;
            break;
          }
        }
      }
    }
    
    if (!matched) {
      // Skip unknown character
      rightRemaining = rightRemaining.slice(1);
    }
  }
  
  // Add number key if needed
  if (hasNumber && cfg.numberKey && !keys.includes(cfg.numberKey)) {
    keys.push(cfg.numberKey);
  }
  
  // Also detect numbers from the content
  if (!hasNumber && cfg.numberKey) {
    for (const numChar of cfg.numbers.values()) {
      if (steno.includes(numChar.replace('-', ''))) {
        if (!keys.includes(cfg.numberKey)) {
          keys.push(cfg.numberKey);
        }
        break;
      }
    }
  }

  return strokeFromKeys(keys);
}

/**
 * Convert a list of keys to a bitmask
 */
function strokeFromKeys(keys: string[]): number {
  const cfg = getStrokeConfig();
  let value = 0;
  
  for (const key of keys) {
    const order = keyOrder.get(key);
    if (order !== undefined) {
      value |= (1 << order);
    }
  }
  
  return value;
}

/**
 * Convert a bitmask to a list of keys
 */
function strokeToKeys(value: number): string[] {
  const cfg = getStrokeConfig();
  const keys: string[] = [];
  
  for (let i = 0; i < cfg.keys.length; i++) {
    if (value & (1 << i)) {
      keys.push(cfg.keys[i]);
    }
  }
  
  return keys;
}

/**
 * Convert a bitmask to steno notation
 */
function strokeToSteno(value: number): string {
  const cfg = getStrokeConfig();
  const keys = strokeToKeys(value);
  
  if (keys.length === 0) {
    return '';
  }

  // Sort keys by their order
  keys.sort((a, b) => (keyOrder.get(a) ?? 0) - (keyOrder.get(b) ?? 0));

  // Check if we have the number key
  const hasNumberKey = cfg.numberKey !== null && keys.includes(cfg.numberKey);
  
  // Build the steno string
  let result = '';
  let needHyphen = true;
  let pastImplicit = false;

  for (const key of keys) {
    // Skip the number key for now
    if (key === cfg.numberKey) continue;

    const keyChar = key.replace('-', '');
    
    // Check if this is an implicit hyphen key
    if (cfg.implicitHyphenKeys.has(key)) {
      pastImplicit = true;
      needHyphen = false;
    }
    
    // Check if this is a right-hand key (starts with -)
    if (key.startsWith('-') && needHyphen && !pastImplicit) {
      result += '-';
      needHyphen = false;
    }

    // Convert to number if applicable
    if (hasNumberKey && cfg.numbers.has(key)) {
      const numKey = cfg.numbers.get(key)!;
      result += numKey.replace('-', '');
    } else {
      result += keyChar;
    }
  }

  // Add number key prefix if needed and not already represented
  if (hasNumberKey) {
    // Check if any number character is in the result
    let hasNumChar = false;
    for (const numKey of cfg.numbers.values()) {
      if (result.includes(numKey.replace('-', ''))) {
        hasNumChar = true;
        break;
      }
    }
    if (!hasNumChar) {
      result = '#' + result;
    }
  }

  return result;
}

// Export helper functions
export const normalizeStroke = Stroke.normalizeStroke;
export const normalizeSteno = Stroke.normalizeSteno;
export const stenoToSortKey = Stroke.stenoToSortKey;

/**
 * Sort steno strokes by fewest strokes, then fewest keys
 */
export function sortStenoStrokes(strokesList: string[][]): string[][] {
  return [...strokesList].sort((a, b) => {
    // First by number of strokes
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    // Then by total number of keys
    const aKeys = a.reduce((sum, s) => sum + Stroke.fromSteno(s).length, 0);
    const bKeys = b.reduce((sum, s) => sum + Stroke.fromSteno(s).length, 0);
    return aKeys - bKeys;
  });
}
