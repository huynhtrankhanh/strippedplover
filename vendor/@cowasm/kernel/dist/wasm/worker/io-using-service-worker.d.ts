/// <reference types="node" />
import { IOHandlerClass, Stream } from "./types";
export default class IOHandler implements IOHandlerClass {
    private id;
    private lastSignalCheck;
    private serviceWorkerBroken;
    constructor(opts: any, serviceWorkerBroken: Function);
    private request;
    sleep(milliseconds: number): void;
    getStdin(milliseconds?: number): Buffer;
    private getSignal;
    sendOutput(stream: Stream, data: Buffer): void;
    getSignalState(): number;
}
