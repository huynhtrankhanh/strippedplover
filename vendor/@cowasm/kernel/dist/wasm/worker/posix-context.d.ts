import WASI from "wasi-js";
import type { WASIConfig } from "wasi-js";
import WasmInstanceSync from "./instance";
interface Options {
    wasiConfig: WASIConfig;
    memory: WebAssembly.Memory;
    wasi: WASI;
    noStdio: boolean;
}
export default class PosixContext {
    private posixEnv;
    private wasm?;
    private wasi;
    private memory;
    private context;
    private wasiConfig;
    constructor({ wasiConfig, memory, wasi, noStdio }: Options);
    private createPosixEnv;
    init(wasm: WasmInstanceSync): void;
    injectFunctions({ env, wasi_snapshot_preview1, }: {
        env: {
            [name: string]: Function;
        };
        wasi_snapshot_preview1: {
            [name: string]: Function;
        };
    }): void;
    private callWithString;
    private callFunction;
    private getcwd;
    private free;
    private run;
}
export {};
