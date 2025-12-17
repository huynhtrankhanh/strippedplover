/**
 * Stroke - Browser-compatible steno stroke handling
 * 
 * This is a self-contained version for the web application.
 */

export interface StrokeConfig {
  keys: readonly string[];
  implicitHyphenKeys: Set<string>;
  numberKey: string | null;
  numbers: Map<string, string>;
  feralNumberKey: boolean;
  undoStrokeSteno: string;
}

// Global configuration
let config: StrokeConfig | null = null;
let keyOrder: Map<string, number> = new Map();

/**
 * Setup the stroke system with the given configuration
 */
export function setupStroke(cfg: StrokeConfig): void {
  config = cfg;
  
  keyOrder = new Map();
  for (let i = 0; i < cfg.keys.length; i++) {
    keyOrder.set(cfg.keys[i], i);
    const numberKey = cfg.numbers.get(cfg.keys[i]);
    if (numberKey) {
      keyOrder.set(numberKey, i);
    }
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

  get value(): number {
    return this._value;
  }

  get rtfcre(): string {
    if (this._rtfcre === null) {
      this._rtfcre = strokeToSteno(this._value);
    }
    return this._rtfcre;
  }

  get stenoKeys(): string[] {
    if (this._keys === null) {
      this._keys = strokeToKeys(this._value);
    }
    return this._keys;
  }

  get isCorrection(): boolean {
    const cfg = getStrokeConfig();
    const undoStroke = Stroke.fromSteno(cfg.undoStrokeSteno);
    return this._value === undoStroke._value;
  }

  get length(): number {
    return this.stenoKeys.length;
  }

  static fromSteno(steno: string): Stroke {
    return new Stroke(strokeFromSteno(steno));
  }

  static fromKeys(keys: string[]): Stroke {
    return new Stroke(strokeFromKeys(keys));
  }

  static fromInteger(value: number): Stroke {
    return new Stroke(value);
  }

  static normalizeStroke(steno: string, strict = true): string {
    try {
      return Stroke.fromSteno(steno).rtfcre;
    } catch (e) {
      if (strict) throw e;
      return steno;
    }
  }

  static normalizeSteno(steno: string, strict = true): string[] {
    try {
      return steno.split('/').map(s => Stroke.normalizeStroke(s, strict));
    } catch (e) {
      if (strict) throw e;
      return steno.split('/');
    }
  }

  static get PREFIX_STROKE(): Stroke {
    return new Stroke(0);
  }

  static get UNDO_STROKE(): Stroke {
    const cfg = getStrokeConfig();
    return Stroke.fromSteno(cfg.undoStrokeSteno);
  }

  contains(other: Stroke): boolean {
    return (this._value & other._value) === other._value;
  }

  subtract(other: Stroke): Stroke {
    return new Stroke(this._value & ~other._value);
  }

  combine(other: Stroke): Stroke {
    return new Stroke(this._value | other._value);
  }

  equals(other: Stroke): boolean {
    return this._value === other._value;
  }

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

function strokeFromSteno(steno: string): number {
  const cfg = getStrokeConfig();
  
  if (!steno) {
    return 0;
  }

  const keys: string[] = [];
  let remaining = steno;
  
  let hasNumber = false;
  if (cfg.numberKey && remaining.startsWith('#')) {
    hasNumber = true;
    remaining = remaining.slice(1);
  }
  
  const hyphenIndex = remaining.indexOf('-');
  const hasExplicitHyphen = hyphenIndex !== -1;
  
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
    }
  }
  
  const boundaryPos = hasExplicitHyphen ? hyphenIndex : implicitHyphenPos;
  const leftPart = boundaryPos === -1 ? remaining : remaining.slice(0, boundaryPos);
  
  let rightPart = '';
  if (hasExplicitHyphen) {
    rightPart = remaining.slice(hyphenIndex + 1);
  } else if (implicitHyphenPos !== -1) {
    rightPart = remaining.slice(implicitHyphenPos);
  }
  
  let leftRemaining = leftPart;
  while (leftRemaining.length > 0) {
    let matched = false;
    
    for (const key of cfg.keys) {
      if (key.startsWith('-')) continue;
      
      const keyChar = key.replace('-', '');
      if (leftRemaining.startsWith(keyChar)) {
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
      leftRemaining = leftRemaining.slice(1);
    }
  }
  
  let rightRemaining = rightPart;
  while (rightRemaining.length > 0) {
    let matched = false;
    
    for (const key of cfg.keys) {
      const keyChar = key.replace('-', '');
      
      if (cfg.implicitHyphenKeys.has(key) || key.startsWith('-')) {
        if (rightRemaining.startsWith(keyChar)) {
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
      rightRemaining = rightRemaining.slice(1);
    }
  }
  
  if (hasNumber && cfg.numberKey && !keys.includes(cfg.numberKey)) {
    keys.push(cfg.numberKey);
  }
  
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

function strokeFromKeys(keys: string[]): number {
  let value = 0;
  
  for (const key of keys) {
    const order = keyOrder.get(key);
    if (order !== undefined) {
      value |= (1 << order);
    }
  }
  
  return value;
}

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

function strokeToSteno(value: number): string {
  const cfg = getStrokeConfig();
  const keys = strokeToKeys(value);
  
  if (keys.length === 0) {
    return '';
  }

  keys.sort((a, b) => (keyOrder.get(a) ?? 0) - (keyOrder.get(b) ?? 0));

  const hasNumberKey = cfg.numberKey !== null && keys.includes(cfg.numberKey);
  
  let result = '';
  let needHyphen = true;
  let pastImplicit = false;

  for (const key of keys) {
    if (key === cfg.numberKey) continue;

    const keyChar = key.replace('-', '');
    
    if (cfg.implicitHyphenKeys.has(key)) {
      pastImplicit = true;
      needHyphen = false;
    }
    
    if (key.startsWith('-') && needHyphen && !pastImplicit) {
      result += '-';
      needHyphen = false;
    }

    if (hasNumberKey && cfg.numbers.has(key)) {
      const numKey = cfg.numbers.get(key)!;
      result += numKey.replace('-', '');
    } else {
      result += keyChar;
    }
  }

  if (hasNumberKey) {
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
