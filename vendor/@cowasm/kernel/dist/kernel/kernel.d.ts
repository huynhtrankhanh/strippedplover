import type { WasmInstanceAsync, WasmInstanceSync } from "../wasm/types";
import { Options as ImportOptions } from "../wasm/import";
import type { FileSystemSpec } from "wasi-js";
type WASMImportFunction = (wasmSource: string, options: ImportOptions, log?: (...args: any[]) => void) => Promise<WasmInstanceSync | WasmInstanceAsync>;
interface KernelOptions {
    wasmSource: string;
    programName?: string;
    wasmImport: WASMImportFunction;
    fs: FileSystemSpec[];
    env: {
        [name: string]: string;
    };
    wasmEnv?: {
        [name: string]: Function;
    };
    noStdio?: boolean;
}
export declare function createAsyncKernel({ wasmSource, wasmImport, fs, env, noStdio, }: KernelOptions): Promise<WasmInstanceAsync>;
export declare function createSyncKernel({ wasmSource, wasmImport, fs, env, wasmEnv, }: KernelOptions): Promise<WasmInstanceSync>;
export {};
