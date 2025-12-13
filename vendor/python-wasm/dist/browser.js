"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const kernel_1 = require("../../@cowasm/kernel");
const common_1 = require("./common");
const packages_1 = require("./packages");
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("python-wasm");
const python_wasm_1 = __importDefault(require("./python.wasm"));
const python_stdlib_zip_1 = __importDefault(require("./python-stdlib.zip"));
const python_minimal_zip_1 = __importDefault(require("./python-minimal.zip"));
const python_readline_zip_1 = __importDefault(require("./python-readline.zip"));
const PYTHONEXECUTABLE = "/usr/lib/python.wasm";
// We ONLY provide async version, since sync version isn't
// possible anymore since dynamic module loading has to be
// sync and browsers don't allow sync webassmbly loading.
async function asyncPython(opts) {
    log("creating async CoWasm kernel...");
    const fs = getFilesystem(opts);
    log("fs = ", fs);
    const kernel = await (0, kernel_1.asyncKernel)({
        env: {
            PYTHONHOME: "/usr",
            PYTHONEXECUTABLE,
            ...opts?.env,
        },
        fs,
    });
    log("done");
    log("fetching ", PYTHONEXECUTABLE);
    await Promise.all([
        kernel.waitUntilFsLoaded(),
        kernel.fetch(python_wasm_1.default, PYTHONEXECUTABLE),
        // TODO: we have to await since once Python starts it synchronously takes over
        // completely and rest of the fetches just can't finish.  Longterm we'll use
        // a completely different model for packages, of course.
        (0, packages_1.fetchPackages)(kernel),
    ]);
    log("initializing python");
    const python = new common_1.PythonWasmAsync(kernel, PYTHONEXECUTABLE);
    await python.init();
    log("done");
    return python;
}
exports.default = asyncPython;
function getFilesystem(opts) {
    // For ref, this is the not efficient version
    //   return [
    //     {
    //       type: "zipurl",
    //       zipurl: pythonFull,
    //       mountpoint: "/usr/lib/python3.11",
    //     },
    //     { type: "dev" },
    //   ];
    return [
        // This will result in synchronously loading a tiny filesystem needed for starting python interpreter.
        {
            type: "zipurl",
            zipurl: opts?.noReadline ? python_minimal_zip_1.default : python_readline_zip_1.default,
            mountpoint: "/usr/lib/python3.11",
        },
        { type: "dev" },
        // Load full stdlib python filesystem asynchronously.  Only needed to run actual interesting code.
        // This way can load the wasm file from disk at the same time as the stdlib.
        {
            type: "zipurl",
            async: true,
            zipurl: python_stdlib_zip_1.default,
            mountpoint: "/usr/lib/python3.11",
        },
    ];
}
//# sourceMappingURL=browser.js.map