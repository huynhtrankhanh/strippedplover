/// <reference types="node" />
import { Options, WasmInstanceAbstractBaseClass } from "./import";
import { EventEmitter } from "events";
import type { WasmInstanceAsync } from "./types";
declare class WorkerThread extends EventEmitter {
    postMessage: (message: any) => void;
    terminate: () => void;
    constructor(worker: Worker);
}
export declare class WasmInstance extends WasmInstanceAbstractBaseClass {
    protected initWorker(): WorkerThread;
}
export default function wasmImportBrowserWorker(wasmSource: string, options?: Options): Promise<WasmInstanceAsync>;
export {};
