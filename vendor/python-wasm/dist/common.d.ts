import { WasmInstanceAsync, WasmInstanceSync } from "@cowasm/kernel";
declare type FileSystemOption = "auto" | "bundle" | "everything" | "stdlib";
export interface Options {
    fs?: FileSystemOption;
    noReadline?: boolean;
    env?: object;
    interactive?: boolean;
    noStdio?: boolean;
}
export declare class PythonWasmSync {
    kernel: WasmInstanceSync;
    python_wasm: string;
    constructor(kernel: WasmInstanceSync, python_wasm: string);
    init(): void;
    callWithString(name: string, str?: string | string[], ...args: any[]): any;
    repr(code: string): string;
    exec(code: string): void;
    terminal(argv?: string[]): number;
}
export declare class PythonWasmAsync {
    kernel: WasmInstanceAsync;
    python_wasm: string;
    constructor(kernel: WasmInstanceAsync, python_wasm: string);
    init(): Promise<void>;
    terminate(): void;
    callWithString(name: string, str?: string | string[], ...args: any[]): Promise<any>;
    repr(code: string): Promise<string>;
    exec(code: string): Promise<void>;
    terminal(argv?: string[]): Promise<number>;
}
export {};
