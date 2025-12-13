import { Options, PythonWasmSync, PythonWasmAsync } from "./common";
export type { Options, PythonWasmSync, PythonWasmAsync };
export declare const path: string;
export declare function syncPython(opts?: Options): Promise<PythonWasmSync>;
export declare function asyncPython(opts?: Options): Promise<PythonWasmAsync>;
export default asyncPython;
