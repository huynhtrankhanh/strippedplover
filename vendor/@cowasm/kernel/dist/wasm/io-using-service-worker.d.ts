/// <reference types="node" />
import type { IOProvider } from "./types";
export default class IOProviderUsingServiceWorker implements IOProvider {
    private id;
    constructor();
    getExtraOptions(): {
        id: string;
    };
    private send;
    signal(sig?: number): void;
    writeToStdin(data: Buffer): void;
    readOutput(): Promise<Buffer>;
}
export declare function fixServiceWorker(): Promise<void>;
