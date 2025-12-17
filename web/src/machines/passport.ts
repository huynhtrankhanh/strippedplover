/**
 * Passport Protocol - Web Serial API implementation
 * 
 * Based on the Plover Passport implementation.
 * Protocol documented at: http://www.eclipsecat.com/?q=system/files/Passport%20protocol_0.pdf
 */

import { StenoMachineBase, isWebSerialSupported } from './types';

// Passport uses different key names that need mapping
const PASSPORT_TO_STENO: Record<string, string> = {
  'S': 'S-',
  'T': 'T-',
  'K': 'K-',
  'P': 'P-',
  'W': 'W-',
  'H': 'H-',
  'R': 'R-',
  'A': 'A-',
  'O': 'O-',
  '*': '*',
  '~': '*',  // Alternative asterisk
  'E': '-E',
  'U': '-U',
  'F': '-F',
  'N': '-R',  // Passport uses N for -R
  'Q': '-R',  // Alternative
  'B': '-B',
  'G': '-G',
  'L': '-L',
  'Y': '-T',  // Passport uses Y for -T
  'X': '-S',  // Passport uses X for -S
  'D': '-D',
  'Z': '-Z',
  '#': '#',
  'C': 'S-',  // Passport C maps to S-
};

export interface PassportOptions {
  port?: SerialPort;
  baudRate?: number;
}

export class PassportMachine extends StenoMachineBase {
  readonly name = 'Passport';
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private running = false;
  private packet: string[] = [];
  private baudRate: number;

  constructor(options: PassportOptions = {}) {
    super();
    this.port = options.port ?? null;
    this.baudRate = options.baudRate ?? 38400;
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
      console.error('Passport: Failed to start capture', error);
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
        console.error('Passport: Read error', error);
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
      const char = String.fromCharCode(byte);
      this.packet.push(char);
      
      if (char === '>') {
        this.handlePacket(this.packet.join(''));
        this.packet = [];
      }
    }
  }

  private handlePacket(packet: string): void {
    // Passport packet format: <.../.../encoded/>
    const parts = packet.split('/');
    if (parts.length < 2) return;
    
    const encoded = parts[1];
    const stenoKeys: string[] = [];
    
    // Parse key/shadow pairs
    for (let i = 0; i < encoded.length; i += 2) {
      const key = encoded[i];
      const shadow = parseInt(encoded[i + 1], 16);
      
      if (shadow >= 8) {
        const mappedKey = PASSPORT_TO_STENO[key.toUpperCase()];
        if (mappedKey && !stenoKeys.includes(mappedKey)) {
          stenoKeys.push(mappedKey);
        }
      }
    }
    
    if (stenoKeys.length > 0) {
      this.notifyStroke(stenoKeys);
    }
  }

  /** For testing without hardware */
  emulatePacket(packet: string): void {
    this.handlePacket(packet);
  }

  emulateStroke(keys: string[]): void {
    this.notifyStroke(keys);
  }

  static get KEYS_LAYOUT(): string {
    return `
      # # # # # # # # # #
      S T P H ~ F N L Y D
      C K W R * Q B G X Z
          A O   E U
    `;
  }
}
