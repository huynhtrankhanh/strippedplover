/// <reference types="node" />
/// <reference types="node" />
import { EventEmitter } from "events";
import type WASI from "wasi-js";
import type { WASIFileSystem } from "wasi-js";
import type { SendToWasmAbstractBase } from "./worker/send-to-wasm";
import type { RecvFromWasmAbstractBase } from "./worker/recv-from-wasm";
import type PosixContext from "./worker/posix-context";
export { Stream } from "./worker/types";
declare class WasmInstance extends EventEmitter {
    fs?: WASIFileSystem;
    table?: WebAssembly.Table;
    wasi?: WASI;
    posixContext?: PosixContext;
    send: SendToWasmAbstractBase;
    recv: RecvFromWasmAbstractBase;
    terminate(): void;
    writeToStdin(_data: any): void;
    waitUntilFsLoaded(): Promise<void>;
    signal(_sig?: number): void;
    getcwd(): string;
    fetch(_url: string, _path: string, _mode?: number | string): Promise<void>;
}
export declare class WasmInstanceSync extends WasmInstance {
    getFunction(_name: string, _dll?: string): Function | undefined;
    callWithString(_name: string | {
        name: string;
        dll: string;
    } | Function, _str?: string | string[], ..._args: any[]): any;
    exec(_argv?: string[]): number;
}
export declare class WasmInstanceAsync extends WasmInstance {
    callWithString(_name: string | {
        name: string;
        dll: string;
    }, _str?: string | string[], ..._args: any[]): Promise<any>;
    exec(_argv?: string[]): Promise<number>;
}
export declare class IOProvider {
    signal: (sig: number) => void;
    getExtraOptions: () => object;
    writeToStdin: (data: Buffer) => void;
    readOutput: () => Promise<Buffer>;
}
