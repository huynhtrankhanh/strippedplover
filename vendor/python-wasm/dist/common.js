"use strict";
/*
Code that is the same for both the browser and node.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonWasmAsync = exports.PythonWasmSync = void 0;
const util_1 = require("./util");
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("python-wasm");
class PythonWasmSync {
    constructor(kernel, python_wasm) {
        this.kernel = kernel;
        this.python_wasm = python_wasm;
        (0, util_1.bind_methods)(this);
    }
    init() {
        log("loading python.wasm...");
        this.callWithString("cowasm_python_init");
        log("done");
    }
    callWithString(name, str, ...args) {
        return this.kernel.callWithString({ name, dll: this.python_wasm }, str, ...args);
    }
    repr(code) {
        log("repr", code);
        const s = this.callWithString("cowasm_python_repr", code);
        log("result =", s);
        return s;
    }
    exec(code) {
        log("exec", code);
        const ret = this.callWithString("cowasm_python_exec", code);
        log("ret", ret);
        if (ret) {
            throw Error("exec failed");
        }
    }
    // starts the python REPL
    terminal(argv = []) {
        log("terminal", argv);
        // NOTE: when you pass a string[] it actually sends argv.length, argv over to WASM!
        const ret = this.callWithString("cowasm_python_terminal", argv);
        log("terminal ended and returned ", ret);
        return ret;
    }
}
exports.PythonWasmSync = PythonWasmSync;
// Run in a worker
class PythonWasmAsync {
    constructor(kernel, python_wasm) {
        this.kernel = kernel;
        this.python_wasm = python_wasm;
        (0, util_1.bind_methods)(this);
    }
    async init() {
        log("loading and calling cowasm_python_init");
        await this.callWithString("cowasm_python_init");
        log("done");
    }
    terminate() {
        this.kernel.terminate();
    }
    async callWithString(name, str, ...args) {
        return await this.kernel.callWithString({ name, dll: this.python_wasm }, str, ...args);
    }
    async repr(code) {
        log("repr", code);
        const ret = await this.callWithString("cowasm_python_repr", code);
        log("done", "ret =", ret);
        return ret;
    }
    async exec(code) {
        log("exec", code);
        const ret = await this.callWithString("cowasm_python_exec", code);
        if (ret) {
            throw Error("exec failed");
        }
    }
    async terminal(argv = []) {
        log("terminal", argv);
        const ret = await this.callWithString("cowasm_python_terminal", argv, argv.length);
        log("terminal ended and returned ", ret);
        return ret;
    }
}
exports.PythonWasmAsync = PythonWasmAsync;
//# sourceMappingURL=common.js.map