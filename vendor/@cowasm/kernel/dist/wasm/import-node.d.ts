import { Options, WasmInstanceAbstractBaseClass, WorkerThread } from "./import";
import type { WasmInstanceAsync } from "./types";
export declare class WasmInstance extends WasmInstanceAbstractBaseClass {
    protected initWorker(): WorkerThread;
    protected configureTerminal(): void;
}
export default function wasmImportNodeWorker(wasmSource: string, // name of the wasm file
options: Options): Promise<WasmInstanceAsync>;
