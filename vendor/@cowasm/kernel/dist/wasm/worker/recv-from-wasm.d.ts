/// <reference types="node" />
interface Options {
    memory: WebAssembly.Memory;
    callFunction: (strings: any, ...args: any[]) => number | undefined;
}
export declare class RecvFromWasmAbstractBase {
    protected memory: WebAssembly.Memory;
    protected callFunction: (strings: any, ...args: any[]) => number | undefined;
    protected view(): DataView;
    strlen(charPtr: number): number;
    pointer(ptr: number): number;
    u32(ptr: number): number;
    i32(ptr: number): number;
    pointer2(ptr: number): number;
    string(ptr: number, bytes?: number): string;
    buffer(ptr: number, bytes: number): Buffer;
    arrayOfStrings(ptr: number): string[];
    arrayOfI32(ptr: number): number[];
}
export default class RecvFromWasm extends RecvFromWasmAbstractBase {
    constructor({ memory, callFunction }: Options);
}
export {};
