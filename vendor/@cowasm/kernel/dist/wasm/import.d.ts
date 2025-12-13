/// <reference types="node" />
import type { Options } from "./worker/import";
import { EventEmitter } from "events";
import { SendToWasmAbstractBase } from "./worker/send-to-wasm";
import { RecvFromWasmAbstractBase } from "./worker/recv-from-wasm";
export { Options };
export interface WorkerThread extends EventEmitter {
    postMessage: (message: object) => void;
    terminate: () => void;
}
export declare class WasmInstanceAbstractBaseClass extends EventEmitter {
    private callId;
    private options;
    private ioProvider;
    private outputMonitorDelay;
    result: any;
    exports: any;
    wasmSource: string;
    protected worker?: WorkerThread;
    send: SendToWasmAbstractBase;
    recv: RecvFromWasmAbstractBase;
    constructor(wasmSource: string, options: Options, IOProviderClass: any);
    signal(sig?: number): void;
    protected initWorker(): WorkerThread;
    writeToStdin(data: any): void;
    private init;
    private readOutput;
    monitorOutput(): Promise<void>;
    terminate(): void;
    callWithString(name: string | {
        name: string;
        dll: string;
    }, str: string | string[], ...args: any[]): Promise<any>;
    waitUntilFsLoaded(): Promise<void>;
    private waitForResponse;
    protected configureTerminal(): void;
    exec(argv?: string[]): Promise<number>;
    getFunction(_name: string, _dll?: string): Function | undefined;
    getcwd(): string;
    fetch(url: string, path: string, mode?: number | string): Promise<void>;
}
