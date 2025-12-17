/**
 * ProCAT Protocol - Web Serial API implementation
 * 
 * Based on the Plover ProCAT implementation.
 * 4 bytes per stroke, last byte is always 0xFF
 */

import { StenoMachineBase, isWebSerialSupported } from './types';

const STENO_KEY_CHART = [
  null, '#', 'S-', 'T-', 'K-', 'P-', 'W-', 'H-',
  'R-', 'A-', 'O-', '*', '-E', '-U', '-F', '-R',
  '-P', '-B', '-L', '-G', '-T', '-S', '-D', '-Z',
];

const BYTES_PER_STROKE = 4;

export interface ProCatOptions {
  port?: SerialPort;
  baudRate?: number;
}

export class ProCatMachine extends StenoMachineBase {
  readonly name = 'ProCAT';
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private running = false;
  private buffer: number[] = [];
  private baudRate: number;

  constructor(options: ProCatOptions = {}) {
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
      console.error('ProCAT: Failed to start capture', error);
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
        console.error('ProCAT: Read error', error);
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
      this.buffer.push(byte);
      
      if (this.buffer.length === BYTES_PER_STROKE) {
        this.processPacket(this.buffer);
        this.buffer = [];
      }
    }
  }

  private processPacket(packet: number[]): void {
    // Validate: first byte should not have MSB set, last byte should be 0xFF
    if ((packet[0] & 0x80) || packet[3] !== 0xFF) {
      console.error('ProCAT: Invalid packet');
      return;
    }

    const stenoKeys: string[] = [];
    
    // Only look at first 3 bytes
    for (let i = 0; i < 3; i++) {
      const byte = packet[i];
      for (let j = 0; j < 8; j++) {
        if (byte & (0x80 >> j)) {
          const keyIndex = i * 8 + j;
          if (keyIndex < STENO_KEY_CHART.length) {
            const key = STENO_KEY_CHART[keyIndex];
            if (key && !stenoKeys.includes(key)) {
              stenoKeys.push(key);
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
      #  #  #  #  #  #  #  #  #  #
      S- T- P- H- * -F -P -L -T -D
      S- K- W- R- * -R -B -G -S -Z
             A- O- -E -U
    `;
  }
}
