import type { WasmInstanceAsync, WasmInstanceSync } from "../wasm/types";
export { WasmInstanceAsync, WasmInstanceSync };
import type { FileSystemSpec } from "wasi-js";
export { FileSystemSpec };
interface Options {
    env?: {
        [name: string]: string;
    };
    fs?: FileSystemSpec[];
    wasmEnv?: {
        [name: string]: Function;
    };
    interactive?: boolean;
    noStdio?: boolean;
}
export declare function syncKernel(opts?: Options): Promise<WasmInstanceSync>;
export declare function asyncKernel(opts?: Options): Promise<WasmInstanceAsync>;
export declare function supportsPosix(): boolean;
