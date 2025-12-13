/// <reference types="node" />
interface Options {
    memory: WebAssembly.Memory;
    callFunction: (strings: any, ...args: any[]) => number | undefined;
}
export declare class SendToWasmAbstractBase {
    protected memory: WebAssembly.Memory;
    protected callFunction: (strings: any, ...args: any[]) => number | undefined;
    malloc(bytes: number): number;
    free(ptr: number): void;
    protected view(): DataView;
    pointer(address: number, ptr: number): void;
    i32(ptr: number, value: number): void;
    f64(ptr: number, value: number): void;
    f32(ptr: number, value: number): void;
    u32(ptr: number, value: number): void;
    string(str: string, dest?: {
        ptr: number;
        len: number;
    }): number;
    encodedString(strAsArray: any, dest?: {
        ptr: number;
        len: number;
    }): number;
    arrayOfStrings(v: string[]): number;
    buffer(buf: Buffer, ptr?: number): number;
}
export default class SendToWasm extends SendToWasmAbstractBase {
    constructor({ memory, callFunction }: Options);
}
export {};
