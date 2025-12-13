"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncPython = exports.syncPython = exports.path = void 0;
const kernel_1 = require("../../@cowasm/kernel");
const path_1 = require("path");
const fs_1 = require("fs");
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("python-wasm");
const common_1 = require("./common");
// This is used for build testing (all packages have a path).
exports.path = __dirname;
const python_wasm = (0, path_1.join)(__dirname, "python.wasm");
const pythonEverything = (0, path_1.join)(__dirname, "python-everything.zip");
const pythonStdlib = (0, path_1.join)(__dirname, "python-stdlib.zip");
const pythonReadline = (0, path_1.join)(__dirname, "python-readline.zip");
const pythonMinimal = (0, path_1.join)(__dirname, "python-minimal.zip");
// For now this is the best we can do.  TODO: cleanest solution in general would be to also include the
// python3.wasm binary (which has main) from the cpython package, to support running python from python.
// The following will only work in the build-from-source dev environment.
const PYTHONEXECUTABLE = (0, path_1.join)(__dirname, "../../cpython/bin/python-wasm");
async function syncPython(opts = { fs: "everything" }) {
    return (await createPython(true, opts));
}
exports.syncPython = syncPython;
async function asyncPython(opts = { fs: "everything" }) {
    return (await createPython(false, opts));
}
exports.asyncPython = asyncPython;
// also make this the default export for consistency with browser api.
exports.default = asyncPython;
async function createPython(sync, opts) {
    opts = { fs: "everything", ...opts }; // default fs is everything
    log("creating Python; sync = ", sync, ", opts = ", opts);
    const fs = getFilesystem(opts);
    let env = { PYTHONEXECUTABLE };
    let wasm = python_wasm;
    if (opts?.fs == "everything") {
        wasm = "/usr/lib/python3.11/python.wasm";
    }
    if (opts?.fs == "everything") {
        env.PYTHONHOME = "/usr";
    }
    if (opts?.env != null) {
        env = { ...env, ...opts.env };
    }
    const kernel = sync
        ? await (0, kernel_1.syncKernel)({ env, fs })
        : await (0, kernel_1.asyncKernel)({
            env,
            fs,
            interactive: opts?.interactive,
            noStdio: opts?.noStdio,
        });
    log("done");
    log("initializing python");
    const python = sync
        ? new common_1.PythonWasmSync(kernel, wasm)
        : new common_1.PythonWasmAsync(kernel, wasm);
    await python.init();
    log("done");
    return python;
}
function getFilesystem(opts) {
    if (opts?.fs == "everything") {
        return [
            {
                type: "zipfile",
                zipfile: pythonEverything,
                mountpoint: "/usr/lib/python3.11",
            },
            { type: "native" },
        ];
    }
    if (opts?.fs == "stdlib") {
        return [
            {
                type: "zipfile",
                zipfile: pythonStdlib,
                mountpoint: "/usr/lib/python3.11",
            },
            { type: "native" },
        ];
    }
    if (opts?.fs == "bundle" || !(0, fs_1.existsSync)(PYTHONEXECUTABLE)) {
        // explicitly requested or not dev environment.
        return [
            // This will result in synchronously loading a tiny filesystem needed for starting python interpreter.
            {
                type: "zipfile",
                zipfile: opts?.noReadline ? pythonMinimal : pythonReadline,
                mountpoint: "/usr/lib/python3.11",
            },
            // Load full stdlib python filesystem asynchronously.  Only needed to run actual interesting code.
            // This way can load the wasm file from disk at the same time as the stdlib.
            {
                type: "zipfile",
                async: true,
                zipfile: pythonStdlib,
                mountpoint: "/usr/lib/python3.11",
            },
            // And the rest of the native filesystem.   **Sandboxing is not at all our goal here yet.**
            { type: "native" },
        ];
    }
    else {
        // native
        return [{ type: "native" }];
    }
}
//# sourceMappingURL=node.js.map