"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportsPosix = exports.asyncKernel = exports.syncKernel = void 0;
const import_node_1 = __importDefault(require("../wasm/import-node"));
const node_1 = __importDefault(require("../wasm/worker/node"));
const kernel_1 = require("./kernel");
const path_1 = require("path");
const constants_1 = require("../wasm/constants");
const posix_node_1 = __importDefault(require("posix-node"));
const KERNEL_WASM = "kernel.wasm";
// Our tiny termcap file only has one entry, which is for xterm
// so that's all we give you, even if you have a different terminal.
const TERM = "xterm-256color";
function getOptions(wasmImport, opts) {
    const path = __dirname;
    const env = {
        ...process.env,
        TERM,
        TERMCAP: (0, path_1.join)(path, "..", "termcap"),
        PS1: "(cowasm)$ ",
        ...opts?.env,
    };
    //PS1: 'cowasm: (pwd | sed "s|^$HOME|~|")$ '
    return {
        programName: process.env.PROGRAM_NAME,
        wasmSource: (0, path_1.join)(path, KERNEL_WASM),
        wasmImport,
        fs: opts?.fs ?? [{ type: "native" }],
        env,
        wasmEnv: opts?.wasmEnv,
        noStdio: opts?.noStdio,
    };
}
// NOTE: we can't just use 'process.on("SIGINT", () => { signal_state = SIGINT; });'
// since the WASM program is blocking events. They just don't happen.  Hence
// we use Zig code against libc for the sync kernel.
// NOTE: Every program needs their own way of explicitly checking for signals, and
// this is only implemented for Python right now.  I'll add it for other things eventually.
function wasmGetSignalState() {
    const state = posix_node_1.default.getSignalState?.(constants_1.SIGINT) ?? 0;
    return state ? constants_1.SIGINT : 0;
}
async function syncKernel(opts) {
    posix_node_1.default.watchForSignal?.(constants_1.SIGINT);
    const kernel = await (0, kernel_1.createSyncKernel)(getOptions(node_1.default, {
        ...opts,
        wasmEnv: { wasmGetSignalState, ...opts?.wasmEnv },
    }));
    return kernel;
}
exports.syncKernel = syncKernel;
async function asyncKernel(opts) {
    const kernel = await (0, kernel_1.createAsyncKernel)(getOptions(import_node_1.default, opts));
    if (opts?.interactive && !opts?.noStdio) {
        asyncIO(kernel);
    }
    return kernel;
}
exports.asyncKernel = asyncKernel;
function supportsPosix() {
    return posix_node_1.default.makeStdinBlocking != null;
}
exports.supportsPosix = supportsPosix;
function asyncIO(kernel) {
    const keyHandler = (key) => {
        kernel.writeToStdin(key);
    };
    process.stdin.on("data", keyHandler);
    const sigintHandler = () => {
        kernel.signal(constants_1.SIGINT);
    };
    process.on("SIGINT", sigintHandler);
    kernel.on("terminate", () => {
        process.stdin.removeListener("data", keyHandler);
        process.removeListener("SIGINT", sigintHandler);
    });
}
//# sourceMappingURL=node.js.map