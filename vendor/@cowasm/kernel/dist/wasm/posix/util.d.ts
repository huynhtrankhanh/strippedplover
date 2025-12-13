export declare class NotImplementedError extends Error {
    ret: number;
    constructor(functionName: string, ret?: number);
}
export declare function notImplemented(functionName: string, ret?: number): void;
