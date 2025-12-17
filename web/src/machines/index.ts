/**
 * Machines Module - Steno machine implementations
 */

export { StenoMachineBase, isWebSerialSupported, isWebHIDSupported } from './types';
export type { StenoMachine, MachineState } from './types';

export { TxBoltMachine, type TxBoltOptions } from './tx-bolt';
export { GeminiPrMachine, type GeminiPrOptions } from './gemini-pr';
export { PassportMachine, type PassportOptions } from './passport';
export { ProCatMachine, type ProCatOptions } from './procat';
export { PloverHidMachine, type PloverHidOptions } from './plover-hid';
export { QwertyKeyboardMachine, type QwertyKeyboardOptions } from './qwerty-keyboard';

import { TxBoltMachine } from './tx-bolt';
import { GeminiPrMachine } from './gemini-pr';
import { PassportMachine } from './passport';
import { ProCatMachine } from './procat';
import { PloverHidMachine } from './plover-hid';
import { QwertyKeyboardMachine } from './qwerty-keyboard';
import type { StenoMachine } from './types';

/**
 * Available machine types
 */
export const MACHINE_TYPES = {
  'TX Bolt': TxBoltMachine,
  'Gemini PR': GeminiPrMachine,
  'Passport': PassportMachine,
  'ProCAT': ProCatMachine,
  'Plover HID': PloverHidMachine,
  'QWERTY Keyboard': QwertyKeyboardMachine,
} as const;

export type MachineType = keyof typeof MACHINE_TYPES;

/**
 * Create a machine instance by type
 */
export function createMachine(type: MachineType, options?: unknown): StenoMachine {
  const MachineClass = MACHINE_TYPES[type];
  return new MachineClass(options as never);
}

// ============================================================================
// Testing / Emulation API
// ============================================================================

/**
 * Emulation interface for testing without hardware
 * This is exposed globally as window.stenoEmulator
 */
export interface StenoEmulator {
  /**
   * Emulate a stroke by steno keys
   */
  emulateStroke(keys: string[]): void;
  
  /**
   * Emulate a stroke by steno string (e.g., "STKPWHR")
   */
  emulateStrokeString(stroke: string): void;
  
  /**
   * Emulate TX Bolt raw bytes
   */
  emulateTxBoltBytes(data: number[]): void;
  
  /**
   * Get the current machine
   */
  getCurrentMachine(): StenoMachine | null;
  
  /**
   * Set the current machine for emulation
   */
  setCurrentMachine(machine: StenoMachine): void;
}

let currentMachine: StenoMachine | null = null;

const stenoEmulator: StenoEmulator = {
  emulateStroke(keys: string[]): void {
    if (currentMachine && 'emulateStroke' in currentMachine) {
      (currentMachine as { emulateStroke: (keys: string[]) => void }).emulateStroke(keys);
    } else {
      console.warn('No machine set for emulation');
    }
  },
  
  emulateStrokeString(stroke: string): void {
    // Parse stroke string to keys
    // This is a simplified parser - the engine's Stroke class is more complete
    const keys: string[] = [];
    
    // Handle # for number
    if (stroke.includes('#')) {
      keys.push('#');
      stroke = stroke.replace('#', '');
    }
    
    // Left hand consonants
    const leftKeys = ['S-', 'T-', 'K-', 'P-', 'W-', 'H-', 'R-'];
    const rightKeys = ['-F', '-R', '-P', '-B', '-L', '-G', '-T', '-S', '-D', '-Z'];
    const vowels = ['A-', 'O-', '-E', '-U'];
    
    // Find the split point (hyphen or first right-hand/vowel key)
    let leftPart = stroke;
    let rightPart = '';
    
    const hyphenIdx = stroke.indexOf('-');
    if (hyphenIdx !== -1) {
      leftPart = stroke.slice(0, hyphenIdx);
      rightPart = stroke.slice(hyphenIdx + 1);
    } else {
      // Find split at first vowel
      for (let i = 0; i < stroke.length; i++) {
        const char = stroke[i];
        if ('AOEU*'.includes(char.toUpperCase())) {
          leftPart = stroke.slice(0, i);
          rightPart = stroke.slice(i);
          break;
        }
      }
    }
    
    // Parse left side
    for (const char of leftPart.toUpperCase()) {
      const key = leftKeys.find(k => k[0] === char);
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
    
    // Parse right side (vowels and right consonants)
    for (const char of rightPart.toUpperCase()) {
      // Check vowels first
      const vowel = vowels.find(v => v.replace('-', '') === char);
      if (vowel && !keys.includes(vowel)) {
        keys.push(vowel);
        continue;
      }
      
      // Check asterisk
      if (char === '*' && !keys.includes('*')) {
        keys.push('*');
        continue;
      }
      
      // Check right consonants
      const rightKey = rightKeys.find(k => k[1] === char);
      if (rightKey && !keys.includes(rightKey)) {
        keys.push(rightKey);
      }
    }
    
    if (keys.length > 0) {
      this.emulateStroke(keys);
    }
  },
  
  emulateTxBoltBytes(data: number[]): void {
    if (currentMachine instanceof TxBoltMachine) {
      currentMachine.emulateBytes(new Uint8Array(data));
    } else {
      console.warn('Current machine is not TX Bolt');
    }
  },
  
  getCurrentMachine(): StenoMachine | null {
    return currentMachine;
  },
  
  setCurrentMachine(machine: StenoMachine): void {
    currentMachine = machine;
  },
};

// Expose globally for testing
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).stenoEmulator = stenoEmulator;
}

export { stenoEmulator };
