/// <reference types="node" />
import { IOHandlerClass, Stream } from "./types";
export default class IOHandler implements IOHandlerClass {
    private stdinBuffer;
    private stdinLength;
    private outputBuffer;
    private outputLength;
    private signalState;
    private sleepArray;
    constructor(opts: any);
    sleep(milliseconds: number): void;
    getStdin(milliseconds?: number): Buffer;
    sendOutput(stream: Stream, data: Buffer): void;
    getSignalState(): number;
}
