/// <reference types="node" />
import type { IOProvider } from "./types";
interface Buffers {
    stdinBuffer: SharedArrayBuffer;
    stdinLengthBuffer: SharedArrayBuffer;
    outputBuffer: SharedArrayBuffer;
    outputLengthBuffer: SharedArrayBuffer;
    signalBuffer: SharedArrayBuffer;
}
export default class IOProviderUsingAtomics implements IOProvider {
    private stdinLength;
    private stdinUint8Array;
    private outputLength;
    private outputUint8Array;
    private signalInt32Array;
    private buffers;
    constructor();
    writeToStdin(data: Buffer): void;
    readOutput(): Promise<Buffer>;
    getExtraOptions(): Buffers;
    signal(sig?: number): void;
}
export {};
