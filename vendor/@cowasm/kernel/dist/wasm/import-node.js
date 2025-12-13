"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WasmInstance = void 0;
const import_1 = require("./import");
const worker_threads_1 = require("worker_threads");
const path_1 = require("path");
const node_process_1 = __importDefault(require("node:process"));
const debug_1 = __importDefault(require("debug"));
const io_using_atomics_1 = __importDefault(require("./io-using-atomics"));
const log = (0, debug_1.default)("wasm:import-node");
class WasmInstance extends import_1.WasmInstanceAbstractBaseClass {
    initWorker() {
        const path = (0, path_1.join)(__dirname, "worker", "node.js");
        return new worker_threads_1.Worker(path, {
            trackUnmanagedFds: false, // this seems incompatible with our use of unionfs/memfs (lots of warnings).
        });
    }
    configureTerminal() {
        const stdinListeners = node_process_1.default.stdin.listeners("data");
        for (const f of stdinListeners) {
            // save listeners on stdin so we can restore them
            // when the terminal finishes
            node_process_1.default.stdin.removeListener("data", f);
        }
        if (this.worker == null)
            throw Error("configureTerminal - bug");
        this.worker.on("exit", () => {
            // put back the original listeners on stdin
            for (const f of stdinListeners) {
                node_process_1.default.stdin.addListener("data", f);
            }
        });
        node_process_1.default.stdin.on("data", (data) => {
            if (log.enabled) {
                log("stdin", data.toString());
            }
            this.writeToStdin(data);
        });
    }
}
exports.WasmInstance = WasmInstance;
async function wasmImportNodeWorker(wasmSource, // name of the wasm file
options) {
    return new WasmInstance(wasmSource, options, io_using_atomics_1.default);
}
exports.default = wasmImportNodeWorker;
//# sourceMappingURL=import-node.js.map