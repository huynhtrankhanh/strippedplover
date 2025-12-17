/**
 * TX Bolt Protocol - Web Serial API implementation
 * 
 * Based on the Plover TX Bolt implementation.
 * 
 * Protocol: 4 sets of keys in variable-length packets (1-4 bytes)
 * 00XXXXXX 01XXXXXX 10XXXXXX 110XXXXX
 *   HWPKTS   UE*OAR   GLBPRF    #ZDST
 */

import { StenoMachineBase, isWebSerialSupported } from './types';

const STENO_KEY_CHART = [
  'S-', 'T-', 'K-', 'P-', 'W-', 'H-',  // Set 0 (00)
  'R-', 'A-', 'O-', '*', '-E', '-U',   // Set 1 (01)
  '-F', '-R', '-P', '-B', '-L', '-G',  // Set 2 (10)
  '-T', '-S', '-D', '-Z', '#',         // Set 3 (11)
];

export interface TxBoltOptions {
  port?: SerialPort;
  baudRate?: number;
}

export class TxBoltMachine extends StenoMachineBase {
  readonly name = 'TX Bolt';
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private running = false;
  private pressedKeys: string[] = [];
  private lastKeySet = 0;
  private baudRate: number;

  constructor(options: TxBoltOptions = {}) {
    super();
    this.port = options.port ?? null;
    this.baudRate = options.baudRate ?? 9600;
  }

  async startCapture(): Promise<void> {
    if (!isWebSerialSupported()) {
      throw new Error('Web Serial API not supported in this browser');
    }

    this.setState('initializing');
    
    try {
      if (!this.port) {
        this.port = await navigator.serial.requestPort();
      }
      
      await this.port.open({ baudRate: this.baudRate });
      
      this.running = true;
      this.setState('connected');
      
      this.readLoop();
    } catch (error) {
      console.error('TX Bolt: Failed to start capture', error);
      this.setState('error');
      throw error;
    }
  }

  stopCapture(): void {
    this.running = false;
    
    if (this.reader) {
      this.reader.cancel().catch(() => {});
      this.reader = null;
    }
    
    if (this.port) {
      this.port.close().catch(() => {});
      this.port = null;
    }
    
    this.setState('stopped');
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) {
      this.setState('error');
      return;
    }
    
    this.reader = this.port.readable!.getReader();
    
    try {
      while (this.running) {
        const { value, done } = await this.reader.read();
        
        if (done) break;
        if (value) this.processBytes(value);
      }
    } catch (error) {
      if (this.running) {
        console.error('TX Bolt: Read error', error);
        this.setState('error');
      }
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private processBytes(data: Uint8Array): void {
    for (const byte of data) {
      const keySet = byte >> 6;
      
      if (keySet <= this.lastKeySet) {
        this.finishStroke();
      }
      
      this.lastKeySet = keySet;
      
      const numBits = keySet === 3 ? 5 : 6;
      for (let i = 0; i < numBits; i++) {
        if ((byte >> i) & 1) {
          const keyIndex = (keySet * 6) + i;
          if (keyIndex < STENO_KEY_CHART.length) {
            this.pressedKeys.push(STENO_KEY_CHART[keyIndex]);
          }
        }
      }
      
      if (keySet === 3) {
        this.finishStroke();
      }
    }
  }

  private finishStroke(): void {
    if (this.pressedKeys.length > 0) {
      this.notifyStroke([...this.pressedKeys]);
    }
    this.resetStrokeState();
  }

  private resetStrokeState(): void {
    this.pressedKeys = [];
    this.lastKeySet = 0;
  }

  /** For testing without hardware */
  emulateBytes(data: Uint8Array): void {
    this.processBytes(data);
  }

  emulateStroke(keys: string[]): void {
    this.notifyStroke(keys);
  }

  static get KEYS_LAYOUT(): string {
    return `
      #  #  #  #  #  #  #  #  #  #
      S- T- P- H- * -F -P -L -T -D
      S- K- W- R- * -R -B -G -S -Z
            A- O-   -E -U
    `;
  }
}
