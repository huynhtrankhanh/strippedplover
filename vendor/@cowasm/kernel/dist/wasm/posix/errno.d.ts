import { Constant } from "./constants";
export default function Errno(error: Constant): Error;
export declare function nativeToWasm(posix: any): {
    [native: number]: number;
};
