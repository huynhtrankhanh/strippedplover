/// <reference types="node" />
import type { WASIFileSystem } from "wasi-js";
import type WASI from "wasi-js";
import { EventEmitter } from "events";
import SendToWasm from "./send-to-wasm";
import RecvFromWasm from "./recv-from-wasm";
import type PosixContext from "./posix-context";
export default class WasmInstanceSync extends EventEmitter {
    result: any;
    resultException: boolean;
    exports: {
        [name: string]: any;
    };
    instance: any;
    memory: WebAssembly.Memory;
    smallStringPtr?: number;
    _getFunctionCache: {
        [name: string]: Function;
    };
    fs?: WASIFileSystem;
    table?: WebAssembly.Table;
    wasi?: WASI;
    run?: (path: string) => number;
    posixContext?: PosixContext;
    send: SendToWasm;
    recv: RecvFromWasm;
    constructor(instance: any, memory: WebAssembly.Memory, fs?: WASIFileSystem, table?: WebAssembly.Table);
    terminate(): void;
    exec(argv?: string[]): number;
    writeToStdin(_data: any): void;
    callWithString(func: string | {
        name: string;
        dll: string;
    } | Function, str?: string | string[], ...args: any[]): any;
    private getSmallStringPtr;
    private callWithSmallString;
    getFunction(name: string, dll?: string): Function | undefined;
    private getFunctionUsingDlopen;
    closeDynamicLibrary(path: string): void;
    getcwd(): string;
    waitUntilFsLoaded(): Promise<void>;
    signal(_sig?: number): void;
    fetch(url: string, path: string, mode?: number | string): Promise<void>;
}
