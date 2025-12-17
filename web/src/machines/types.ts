/**
 * Machine Types - Interfaces for steno machine implementations
 */

export type MachineState = 'stopped' | 'initializing' | 'connected' | 'disconnected' | 'error';

export interface StenoMachine {
  readonly name: string;
  readonly state: MachineState;
  
  startCapture(): Promise<void>;
  stopCapture(): void;
  addStrokeCallback(callback: (keys: string[]) => void): void;
  removeStrokeCallback(callback: (keys: string[]) => void): void;
  addStateCallback(callback: (state: MachineState) => void): void;
  removeStateCallback(callback: (state: MachineState) => void): void;
}

/**
 * Base class for steno machines
 */
export abstract class StenoMachineBase implements StenoMachine {
  abstract readonly name: string;
  protected _state: MachineState = 'stopped';
  protected strokeCallbacks: Set<(keys: string[]) => void> = new Set();
  protected stateCallbacks: Set<(state: MachineState) => void> = new Set();

  get state(): MachineState {
    return this._state;
  }

  protected setState(state: MachineState): void {
    this._state = state;
    for (const callback of this.stateCallbacks) {
      callback(state);
    }
  }

  protected notifyStroke(keys: string[]): void {
    for (const callback of this.strokeCallbacks) {
      callback(keys);
    }
  }

  abstract startCapture(): Promise<void>;
  abstract stopCapture(): void;

  addStrokeCallback(callback: (keys: string[]) => void): void {
    this.strokeCallbacks.add(callback);
  }

  removeStrokeCallback(callback: (keys: string[]) => void): void {
    this.strokeCallbacks.delete(callback);
  }

  addStateCallback(callback: (state: MachineState) => void): void {
    this.stateCallbacks.add(callback);
  }

  removeStateCallback(callback: (state: MachineState) => void): void {
    this.stateCallbacks.delete(callback);
  }
}

/**
 * Check if Web Serial API is available
 */
export function isWebSerialSupported(): boolean {
  return 'serial' in navigator;
}

/**
 * Check if WebHID API is available
 */
export function isWebHIDSupported(): boolean {
  return 'hid' in navigator;
}
