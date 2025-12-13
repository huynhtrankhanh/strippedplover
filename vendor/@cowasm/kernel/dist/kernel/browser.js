"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportsPosix = exports.asyncKernel = exports.syncKernel = void 0;
const import_browser_1 = __importDefault(require("../wasm/import-browser"));
const browser_1 = __importDefault(require("../wasm/worker/browser"));
const kernel_1 = require("./kernel");
const kernel_wasm_1 = __importDefault(require("./kernel.wasm"));
function getOptions(wasmImport, opts) {
    const fs = opts?.fs ?? [{ type: "dev" }];
    const env = {
        TERMCAP: "/usr/lib/python3.11/termcap",
        TERM: "xterm-256color",
        PS1: "(cowasm)$ ",
        ...opts?.env,
    };
    return {
        programName: "/bin/cowasm",
        wasmSource: kernel_wasm_1.default,
        wasmImport,
        fs,
        env,
    };
}
async function syncKernel(opts) {
    return await (0, kernel_1.createSyncKernel)(getOptions(browser_1.default, opts));
}
exports.syncKernel = syncKernel;
async function asyncKernel(opts) {
    return await (0, kernel_1.createAsyncKernel)(getOptions(import_browser_1.default, opts));
}
exports.asyncKernel = asyncKernel;
function supportsPosix() {
    return false;
}
exports.supportsPosix = supportsPosix;
//# sourceMappingURL=browser.js.map