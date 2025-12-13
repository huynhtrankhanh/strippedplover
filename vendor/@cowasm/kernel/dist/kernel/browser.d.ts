import type { WasmInstanceAsync, WasmInstanceSync } from "../wasm/types";
import type { FileSystemSpec } from "wasi-js";
interface Options {
    env?: {
        [name: string]: string;
    };
    fs?: FileSystemSpec[];
}
export declare function syncKernel(opts?: Options): Promise<WasmInstanceSync>;
export declare function asyncKernel(opts?: Options): Promise<WasmInstanceAsync>;
export declare function supportsPosix(): boolean;
export {};
