/// <reference types="node" />
import type { FileSystemSpec, WASIBindings } from "wasi-js";
import WasmInstanceSync from "./instance";
export declare function strlen(charPtr: number, memory: WebAssembly.Memory): number;
export interface Options {
    wasmEnv?: {
        [name: string]: Function;
    };
    env?: {
        [name: string]: string;
    };
    time?: boolean;
    sleep?: (milliseconds: number) => void;
    stdinBuffer?: SharedArrayBuffer;
    signalBuffer?: SharedArrayBuffer;
    getStdin?: () => Buffer;
    sendStdout?: (Buffer: any) => void;
    sendStderr?: (Buffer: any) => void;
    fs?: FileSystemSpec[];
    locks?: {
        spinLockBuffer: SharedArrayBuffer;
        stdinLockBuffer: SharedArrayBuffer;
    };
    noStdio?: boolean;
}
type WasmImportFunction = typeof doWasmImport;
declare function doWasmImport({ source, bindings, options, importWebAssemblySync, importWebAssembly, readFileSync, maxMemoryMB, }: {
    source: string;
    bindings: WASIBindings;
    options: Options;
    importWebAssemblySync: (path: string, opts: WebAssembly.Imports) => WebAssembly.Instance;
    importWebAssembly: (path: string, opts: WebAssembly.Imports) => Promise<WebAssembly.Instance>;
    readFileSync: any;
    maxMemoryMB?: number;
}): Promise<WasmInstanceSync>;
declare const wasmImport: WasmImportFunction;
export default wasmImport;
