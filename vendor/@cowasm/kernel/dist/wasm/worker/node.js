"use strict";
/*
Initialize our WASM setup.

This can be run as a Worker script when importing the wasm module in node.js
in the mode where we use a Worker.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("fs/promises");
const wasi_js_1 = require("wasi-js");
const node_1 = __importDefault(require("wasi-js/dist/bindings/node"));
const path_1 = require("path");
const import_1 = __importDefault(require("./import"));
const worker_threads_1 = require("worker_threads");
const init_1 = __importDefault(require("./init"));
const debug_1 = __importDefault(require("debug"));
const os_1 = __importDefault(require("os"));
const child_process_1 = __importDefault(require("child_process"));
const posix_node_1 = __importDefault(require("posix-node"));
const io_using_atomics_1 = __importDefault(require("./io-using-atomics"));
const log = (0, debug_1.default)("wasm:worker");
async function wasmImportNode(name, options) {
    log("wasmImportNode");
    const path = (0, path_1.dirname)((0, path_1.join)(__filename, "..", ".."));
    if (!(0, path_1.isAbsolute)(name)) {
        // it's critical to make this canonical BEFORE calling the debounced function,
        // or randomly otherwise end up with same module imported twice, which will
        // result in a "hellish nightmare" of subtle bugs.
        name = (0, path_1.join)(path, name);
    }
    // also fix zip path, if necessary and read in any zip files (so they can be loaded into memfs).
    const fsSpec = [];
    for (const X of options.fs ?? []) {
        if (X.type == "zipfile") {
            if (!(0, path_1.isAbsolute)(X.zipfile)) {
                X.zipfile = (0, path_1.join)(path, X.zipfile);
            }
            let Y;
            if (X.async) {
                Y = {
                    type: "zip-async",
                    getData: async () => await (0, promises_1.readFile)(X.zipfile),
                    mountpoint: X.mountpoint,
                };
            }
            else {
                try {
                    Y = {
                        type: "zip",
                        data: await (0, promises_1.readFile)(X.zipfile),
                        mountpoint: X.mountpoint,
                    };
                }
                catch (err) {
                    // non-fatal
                    // We *might* use this eventually when building the datafile itself, if we switch to using cpython wasm to build
                    // instead of native cpython.
                    console.warn(`WARNING: Unable to read filesystem datafile '${X.zipfile}' -- falling back to filesystem.`);
                }
            }
            fsSpec.push(Y);
        }
        else {
            fsSpec.push(X);
        }
    }
    const fs = (0, wasi_js_1.createFileSystem)(fsSpec, node_1.default.fs);
    function importWebAssemblySync(path, opts) {
        const binary = new Uint8Array(fs.readFileSync(path));
        const mod = new WebAssembly.Module(binary);
        return new WebAssembly.Instance(mod, opts);
    }
    async function importWebAssembly(path, opts) {
        const binary = new Uint8Array(await (0, promises_1.readFile)(path));
        const mod = new WebAssembly.Module(binary);
        return new WebAssembly.Instance(mod, opts);
    }
    if (options.sleep == null && posix_node_1.default.sleep != null && posix_node_1.default.usleep != null) {
        // don't have sleep support (since single thread), and we can provide
        // that via posix and not burn 100% cpu.
        const { sleep, usleep } = posix_node_1.default;
        options.sleep = (milliseconds) => {
            const seconds = Math.floor(milliseconds / 1000);
            if (seconds > 0) {
                sleep(seconds);
            }
            const microseconds = Math.floor(1000000 * (milliseconds / 1000 - seconds));
            if (microseconds > 0) {
                usleep(microseconds);
            }
        };
    }
    return await (0, import_1.default)({
        source: name,
        bindings: { ...node_1.default, fs, os: os_1.default, child_process: child_process_1.default, posix: posix_node_1.default },
        options,
        importWebAssembly,
        importWebAssemblySync,
        readFileSync: fs.readFileSync,
    });
}
exports.default = wasmImportNode;
if (!worker_threads_1.isMainThread && worker_threads_1.parentPort != null) {
    log("running as a worker thread.");
    (0, init_1.default)({
        wasmImport: wasmImportNode,
        parent: worker_threads_1.parentPort,
        IOHandler: io_using_atomics_1.default,
    });
}
else {
    log("running in the main thread");
    // We enable blocking stdin if at all possible
    // so that when wasi does
    // fs.readSync(stdin, ...)
    // it blocks and waits
    // for an input character, rather than immediately
    // giving an error or 0 characters, except when one
    // is ready. This is much better than a loop with
    // 100% cpu usage!
    // NOTE
    // - right now enableRawInput is only available on
    //   macos and linux platforms, e.g., not on windows.
    try {
        posix_node_1.default.makeStdinBlocking?.();
    }
    catch (_err) {
        console.warn("POSIX blocking stdin not available. Try using --worker.");
    }
}
//# sourceMappingURL=node.js.map