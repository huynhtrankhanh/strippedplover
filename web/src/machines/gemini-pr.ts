/**
 * Gemini PR Protocol - Web Serial API implementation
 * 
 * Based on the Plover Gemini PR implementation.
 * 
 * Protocol: 6 bytes per packet, MSB indicates first byte
 * 7 bits of steno data per byte
 */

import { StenoMachineBase, isWebSerialSupported } from './types';

const STENO_KEY_CHART = [
  'Fn', '#1', '#2', '#3', '#4', '#5', '#6',
  'S1-', 'S2-', 'T-', 'K-', 'P-', 'W-', 'H-',
  'R-', 'A-', 'O-', '*1', '*2', 'res1', 'res2',
  'pwr', '*3', '*4', '-E', '-U', '-F', '-R',
  '-P', '-B', '-L', '-G', '-T', '-S', '-D',
  '#7', '#8', '#9', '#A', '#B', '#C', '-Z',
];

const BYTES_PER_STROKE = 6;

// Mapping from Gemini keys to standard steno keys
const GEMINI_TO_STENO: Record<string, string> = {
  'S1-': 'S-',
  'S2-': 'S-',
  '*1': '*',
  '*2': '*',
  '*3': '*',
  '*4': '*',
  '#1': '#',
  '#2': '#',
  '#3': '#',
  '#4': '#',
  '#5': '#',
  '#6': '#',
  '#7': '#',
  '#8': '#',
  '#9': '#',
  '#A': '#',
  '#B': '#',
  '#C': '#',
};

export interface GeminiPrOptions {
  port?: SerialPort;
  baudRate?: number;
}

export class GeminiPrMachine extends StenoMachineBase {
  readonly name = 'Gemini PR';
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private running = false;
  private buffer: number[] = [];
  private baudRate: number;

  constructor(options: GeminiPrOptions = {}) {
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
      console.error('Gemini PR: Failed to start capture', error);
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
        console.error('Gemini PR: Read error', error);
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
      // First byte has MSB set
      if (byte & 0x80) {
        // Start of new packet, process previous if complete
        if (this.buffer.length === BYTES_PER_STROKE) {
          this.processPacket(this.buffer);
        }
        this.buffer = [byte];
      } else {
        this.buffer.push(byte);
        if (this.buffer.length === BYTES_PER_STROKE) {
          this.processPacket(this.buffer);
          this.buffer = [];
        }
      }
    }
  }

  private processPacket(packet: number[]): void {
    // Validate packet
    if (!(packet[0] & 0x80) || packet.slice(1).some(b => b & 0x80)) {
      console.error('Gemini PR: Invalid packet');
      return;
    }

    const stenoKeys: string[] = [];
    
    for (let i = 0; i < packet.length; i++) {
      const byte = packet[i];
      for (let j = 1; j < 8; j++) {
        if (byte & (0x80 >> j)) {
          const keyIndex = i * 7 + j - 1;
          if (keyIndex < STENO_KEY_CHART.length) {
            const key = STENO_KEY_CHART[keyIndex];
            // Map to standard keys
            const mappedKey = GEMINI_TO_STENO[key] ?? key;
            if (!stenoKeys.includes(mappedKey) && !['Fn', 'pwr', 'res1', 'res2'].includes(key)) {
              stenoKeys.push(mappedKey);
            }
          }
        }
      }
    }

    if (stenoKeys.length > 0) {
      this.notifyStroke(stenoKeys);
    }
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
      #1 #2  #3 #4 #5 #6 #7 #8 #9 #A #B #C
      Fn S1- T- P- H- *1 *3 -F -P -L -T -D
         S2- K- W- R- *2 *4 -R -B -G -S -Z
                A- O-       -E -U
    `;
  }
}
