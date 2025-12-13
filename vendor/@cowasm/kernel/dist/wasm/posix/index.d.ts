import WASI from "wasi-js";
import SendToWasm from "../worker/send-to-wasm";
import RecvFromWasm from "../worker/recv-from-wasm";
export interface Context {
    state: {
        [name: string]: any;
    };
    fs: FileSystem;
    send: SendToWasm;
    recv: RecvFromWasm;
    wasi: WASI;
    run: (args: string[]) => number;
    process: {
        getpid?: () => number;
        getuid?: () => number;
        pid?: number;
        cwd?: () => string;
    };
    os: {
        loadavg?: () => [number, number, number];
        getPriority?: (pid?: number) => number;
        setPriority?: (pid: number, priority?: number) => void;
        platform?: () => // we care about darwin/linux/win32 for our runtime.
        "darwin" | "linux" | "win32" | "aix" | "freebsd" | "openbsd" | "sunos";
    };
    child_process: {
        spawnSync?: (command: string) => number;
    };
    memory: WebAssembly.Memory;
    posix: {
        getpgid?: () => number;
        constants?: {
            [code: string]: number;
        };
        chdir?: (string: any) => void;
    };
    free: (ptr: number) => void;
    callFunction: (name: string, ...args: any[]) => number | undefined;
    callWithString: (func: string | {
        name: string;
        dll: string;
    } | Function, str?: string | string[], ...args: any[]) => number | undefined;
    getcwd: () => string;
    sleep?: (milliseconds: number) => void;
    noStdio: boolean;
}
export type PosixEnv = {
    [name: string]: Function;
};
export default function posix(context: Context): PosixEnv;
