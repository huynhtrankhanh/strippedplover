"use strict";
/*
This is the Worker script when importing the wasm module in a web browser.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const wasi_js_1 = require("wasi-js");
const browser_1 = __importDefault(require("wasi-js/dist/bindings/browser"));
const import_1 = __importDefault(require("./import"));
const init_1 = __importDefault(require("./init"));
const debug_1 = __importDefault(require("debug"));
const events_1 = require("events");
const posix_browser_1 = __importDefault(require("./posix-browser"));
const io_using_atomics_1 = __importDefault(require("./io-using-atomics"));
const io_using_service_worker_1 = __importDefault(require("./io-using-service-worker"));
const log = (0, debug_1.default)("wasm:worker:browser");
async function wasmImportBrowser(wasmUrl, options = {}) {
    log("wasmImportBrowser");
    // also fix zip path, if necessary and read in any zip files (so
    // they can be loaded into memfs).
    log("processing fs=", options.fs);
    const fsSpec = [];
    for (const X of options.fs ?? []) {
        if (X.type == "zipurl") {
            let Y;
            if (!X.async) {
                Y = {
                    type: "zip",
                    data: await (await fetch(X.zipurl)).arrayBuffer(),
                    mountpoint: X.mountpoint,
                };
            }
            else {
                // we asynchronously load it irregardless of whatever else is happening...
                // TODO:
                Y = {
                    type: "zip-async",
                    getData: async () => await (await fetch(X.zipurl)).arrayBuffer(),
                    mountpoint: X.mountpoint,
                };
            }
            fsSpec.push(Y);
        }
        else {
            fsSpec.push(X);
        }
    }
    const fs = (0, wasi_js_1.createFileSystem)(fsSpec);
    // Assumed to be loaded into memfs.
    function importWebAssemblySync(path, options) {
        const binary = new Uint8Array(fs.readFileSync(path));
        const mod = new WebAssembly.Module(binary);
        return new WebAssembly.Instance(mod, options);
    }
    const wasm = await (0, import_1.default)({
        source: wasmUrl,
        bindings: { ...browser_1.default, fs, posix: posix_browser_1.default },
        options,
        importWebAssembly,
        importWebAssemblySync,
        readFileSync: (path) => {
            return fs.readFileSync(path);
        },
        maxMemoryMB: 1000,
    });
    return wasm;
}
exports.default = wasmImportBrowser;
// Download from our server.
async function importWebAssembly(path, options) {
    const { instance } = await WebAssembly.instantiateStreaming(fetch(path), options);
    return instance;
}
function main() {
    // in a worker, so do worker stuff
    log("initializing worker");
    class Parent extends events_1.EventEmitter {
        constructor() {
            super();
            this.postMessage = self.postMessage.bind(self);
            self.onmessage = ({ data: message }) => {
                this.emit("message", message);
            };
        }
    }
    const parent = new Parent();
    (0, init_1.default)({
        wasmImport: wasmImportBrowser,
        parent,
        captureOutput: true,
        IOHandler: crossOriginIsolated
            ? io_using_atomics_1.default
            : io_using_service_worker_1.default,
    });
}
if (self.document == null) {
    main();
}
//# sourceMappingURL=browser.js.map