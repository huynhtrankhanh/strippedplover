declare function delay(milliseconds: any): Promise<any>;
declare function handleSleep(e: any): Promise<Response>;
declare function handleWriteSignal(e: any): Promise<Response>;
declare function handleReadSignal(e: any): Promise<Response>;
declare function handleWriteStdin(e: any): Promise<Response>;
declare function waitForStdin(id: any, milliseconds?: number): Promise<void>;
declare function handleReadStdin(e: any): Promise<Response>;
declare function handleWriteOutput(e: any): Promise<Response>;
declare function handleReadOutput(e: any): Promise<Response>;
declare const VERSION: 6;
declare function log(...args: any[]): void;
declare const PREFIX: "/python-wasm-sw/";
declare namespace cache {
    const sig: {};
    const stdin: {};
    const callOnStdin: {};
    const output: {};
}
