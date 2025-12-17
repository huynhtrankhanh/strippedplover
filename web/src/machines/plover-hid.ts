/**
 * Plover HID Protocol - WebHID API implementation
 * 
 * Based on the Plover HID implementation.
 * Uses HID-based protocol with usage page 0xFF50 and usage 0x4C56
 */

import { StenoMachineBase, isWebHIDSupported } from './types';

const USAGE_PAGE = 0xFF50;
const USAGE = 0x4C56;
const N_LEVERS = 64;
const SIMPLE_REPORT_LEN = N_LEVERS / 8;

const STENO_KEY_CHART = [
  'S1-', 'T-', 'K-', 'P-', 'W-', 'H-', 'R-', 'A-',
  'O-', '*1', '-E', '-U', '-F', '-R', '-P', '-B',
  '-L', '-G', '-T', '-S', '-D', '-Z', '#1', 'S2-',
  '*2', '*3', '*4', '#2', '#3', '#4', '#5', '#6',
  '#7', '#8', '#9', '#A', '#B', '#C', 'X1', 'X2',
  'X3', 'X4', 'X5', 'X6', 'X7', 'X8', 'X9', 'X10',
  'X11', 'X12', 'X13', 'X14', 'X15', 'X16', 'X17', 'X18',
  'X19', 'X20', 'X21', 'X22', 'X23', 'X24', 'X25', 'X26',
];

// Map HID keys to standard steno keys
const HID_TO_STENO: Record<string, string> = {
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

export interface PloverHidOptions {
  device?: HIDDevice;
  firstUpChordSend?: boolean;
}

export class PloverHidMachine extends StenoMachineBase {
  readonly name = 'Plover HID';
  private device: HIDDevice | null = null;
  private running = false;
  private keyState = 0n;
  private firstUpChordSend: boolean;

  constructor(options: PloverHidOptions = {}) {
    super();
    this.device = options.device ?? null;
    this.firstUpChordSend = options.firstUpChordSend ?? false;
  }

  async startCapture(): Promise<void> {
    if (!isWebHIDSupported()) {
      throw new Error('WebHID API not supported in this browser');
    }

    this.setState('initializing');
    
    try {
      if (!this.device) {
        const devices = await navigator.hid.requestDevice({
          filters: [{ usagePage: USAGE_PAGE, usage: USAGE }],
        });
        
        if (devices.length === 0) {
          throw new Error('No Plover HID device selected');
        }
        
        this.device = devices[0];
      }
      
      if (!this.device!.opened) {
        await this.device!.open();
      }
      
      this.device!.addEventListener('inputreport', this.handleInputReport);
      
      this.running = true;
      this.setState('connected');
    } catch (error) {
      console.error('Plover HID: Failed to start capture', error);
      this.setState('error');
      throw error;
    }
  }

  stopCapture(): void {
    this.running = false;
    
    if (this.device) {
      this.device.removeEventListener('inputreport', this.handleInputReport);
      this.device.close().catch(() => {});
      this.device = null;
    }
    
    this.setState('stopped');
  }

  private handleInputReport = (event: HIDInputReportEvent): void => {
    const { data } = event;
    
    try {
      const keyState = this.parseReport(new Uint8Array(data.buffer));
      this.processKeyState(keyState);
    } catch (error) {
      console.error('Plover HID: Invalid report', error);
    }
  };

  private parseReport(report: Uint8Array): bigint {
    // Report ID 0x50 ('P') followed by key state
    if (report.length > SIMPLE_REPORT_LEN && report[0] === 0x50) {
      let keyState = 0n;
      for (let i = 1; i <= SIMPLE_REPORT_LEN; i++) {
        keyState = (keyState << 8n) | BigInt(report[i]);
      }
      return keyState;
    }
    throw new Error('Invalid report format');
  }

  private processKeyState(current: bigint): void {
    if (this.firstUpChordSend) {
      // Send chord when first key is released
      if ((this.keyState & ~current) !== 0n) {
        this.sendChord(this.keyState);
      }
    } else {
      // Send chord when all keys are released
      if (current === 0n && this.keyState !== 0n) {
        this.sendChord(this.keyState);
      }
    }
    
    this.keyState = current;
  }

  private sendChord(keyState: bigint): void {
    const stenoKeys: string[] = [];
    
    for (let i = 0; i < STENO_KEY_CHART.length; i++) {
      if ((keyState >> BigInt(63 - i)) & 1n) {
        const key = STENO_KEY_CHART[i];
        const mappedKey = HID_TO_STENO[key] ?? key;
        
        // Skip extended keys
        if (mappedKey.startsWith('X')) continue;
        
        if (!stenoKeys.includes(mappedKey)) {
          stenoKeys.push(mappedKey);
        }
      }
    }
    
    if (stenoKeys.length > 0) {
      this.notifyStroke(stenoKeys);
    }
    
    this.keyState = 0n;
  }

  /** For testing without hardware */
  emulateKeyState(keyState: bigint): void {
    this.processKeyState(keyState);
  }

  emulateStroke(keys: string[]): void {
    this.notifyStroke(keys);
  }

  static get KEYS_LAYOUT(): string {
    return `
      #1 #2  #3 #4 #5 #6 #7 #8 #9 #A #B #C
         S1- T- P- H- *1 *3 -F -P -L -T -D
         S2- K- W- R- *2 *4 -R -B -G -S -Z
                A- O-       -E -U
    `;
  }
}
