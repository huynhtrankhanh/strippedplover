/**
 * QWERTY Keyboard Machine - Browser keyboard capture for steno
 * 
 * Based on the Plover keyboard implementation.
 * Supports NKRO keyboards for proper steno input.
 */

import { StenoMachineBase } from './types';

// Default QWERTY to steno key mapping
// This follows the standard Plover keyboard layout
const DEFAULT_KEYMAP: Record<string, string> = {
  // Top row - number keys
  '1': 'S-',
  '2': 'T-',
  '3': 'P-',
  '4': 'H-',
  '5': '*',
  '6': '*',
  '7': '-F',
  '8': '-P',
  '9': '-L',
  '0': '-T',
  '-': '-D',
  
  // Home row
  'q': 'S-',
  'w': 'T-',
  'e': 'P-',
  'r': 'H-',
  't': '*',
  'y': '*',
  'u': '-F',
  'i': '-P',
  'o': '-L',
  'p': '-T',
  '[': '-D',
  
  // Middle row
  'a': 'S-',
  's': 'K-',
  'd': 'W-',
  'f': 'R-',
  'g': '*',
  'h': '*',
  'j': '-R',
  'k': '-B',
  'l': '-G',
  ';': '-S',
  "'": '-Z',
  
  // Bottom row - vowels
  'c': 'A-',
  'v': 'O-',
  'n': '-E',
  'm': '-U',
};

// Alternative S1- as # key mapping
// When enabled, the 'q' key becomes # instead of S-
const S1_AS_NUMBER_KEYMAP: Record<string, string> = {
  ...DEFAULT_KEYMAP,
  'q': '#',  // S1- position becomes #
};

export interface QwertyKeyboardOptions {
  arpeggiate?: boolean;
  firstUpChordSend?: boolean;
  s1AsNumberKey?: boolean;  // New option: S1- as # key (default: true)
  customKeymap?: Record<string, string>;
}

export class QwertyKeyboardMachine extends StenoMachineBase {
  readonly name = 'QWERTY Keyboard';
  private running = false;
  private downKeys: Set<string> = new Set();
  private strokeKeys: Set<string> = new Set();
  private arpeggiate: boolean;
  private firstUpChordSend: boolean;
  private chordAlreadySent = false;
  private keymap: Record<string, string>;
  private s1AsNumberKey: boolean;

  constructor(options: QwertyKeyboardOptions = {}) {
    super();
    this.arpeggiate = options.arpeggiate ?? false;
    this.firstUpChordSend = options.firstUpChordSend ?? false;
    this.s1AsNumberKey = options.s1AsNumberKey ?? true;  // Default: ON
    
    // Use custom keymap if provided, otherwise use default based on s1AsNumberKey
    this.keymap = options.customKeymap ?? 
      (this.s1AsNumberKey ? S1_AS_NUMBER_KEYMAP : DEFAULT_KEYMAP);
  }

  /**
   * Update the S1 as # key option
   */
  setS1AsNumberKey(enabled: boolean): void {
    this.s1AsNumberKey = enabled;
    this.keymap = enabled ? S1_AS_NUMBER_KEYMAP : DEFAULT_KEYMAP;
  }

  /**
   * Get current S1 as # key setting
   */
  getS1AsNumberKey(): boolean {
    return this.s1AsNumberKey;
  }

  async startCapture(): Promise<void> {
    this.setState('initializing');
    
    try {
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('keyup', this.handleKeyUp);
      
      this.running = true;
      this.setState('connected');
    } catch (error) {
      console.error('QWERTY Keyboard: Failed to start capture', error);
      this.setState('error');
      throw error;
    }
  }

  stopCapture(): void {
    this.running = false;
    
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    
    this.downKeys.clear();
    this.strokeKeys.clear();
    this.chordAlreadySent = false;
    
    this.setState('stopped');
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.running) return;
    
    const key = event.key.toLowerCase();
    
    // Only process keys that are in our keymap
    if (!(key in this.keymap)) return;
    
    // Prevent default browser behavior for steno keys
    event.preventDefault();
    
    this.downKeys.add(key);
    
    if (this.firstUpChordSend) {
      this.chordAlreadySent = false;
    } else {
      this.strokeKeys.add(key);
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (!this.running) return;
    
    const key = event.key.toLowerCase();
    
    // Only process keys that are in our keymap
    if (!(key in this.keymap)) return;
    
    event.preventDefault();
    
    this.downKeys.delete(key);
    
    if (this.firstUpChordSend) {
      if (!this.chordAlreadySent) {
        // Send chord on first key release
        const keysToSend = new Set(this.downKeys);
        keysToSend.add(key);  // Include the key that was just released
        this.sendChord(keysToSend);
        this.chordAlreadySent = true;
      }
    } else {
      // Check if stroke is complete (all keys released)
      if (this.downKeys.size === 0 && this.strokeKeys.size > 0) {
        // In arpeggiate mode, require space key to send
        if (!this.arpeggiate || this.strokeKeys.has(' ')) {
          this.sendChord(this.strokeKeys);
        }
        this.strokeKeys.clear();
      }
    }
  };

  private sendChord(keys: Set<string>): void {
    const stenoKeys: string[] = [];
    
    for (const key of keys) {
      const stenoKey = this.keymap[key];
      if (stenoKey && !stenoKeys.includes(stenoKey)) {
        stenoKeys.push(stenoKey);
      }
    }
    
    if (stenoKeys.length > 0) {
      this.notifyStroke(stenoKeys);
    }
  }

  /** For testing */
  emulateStroke(keys: string[]): void {
    this.notifyStroke(keys);
  }

  /**
   * Get the current keymap
   */
  getKeymap(): Record<string, string> {
    return { ...this.keymap };
  }

  /**
   * Set a custom keymap
   */
  setKeymap(keymap: Record<string, string>): void {
    this.keymap = { ...keymap };
  }

  static get KEYS_LAYOUT(): string {
    return `
      1  2  3  4  5  6  7  8  9  0  -
      q  w  e  r  t  y  u  i  o  p  [
      a  s  d  f  g  h  j  k  l  ;  '
            c  v     n  m
    `;
  }

  static get DEFAULT_KEYMAP(): Record<string, string> {
    return { ...DEFAULT_KEYMAP };
  }

  static get S1_AS_NUMBER_KEYMAP(): Record<string, string> {
    return { ...S1_AS_NUMBER_KEYMAP };
  }
}
