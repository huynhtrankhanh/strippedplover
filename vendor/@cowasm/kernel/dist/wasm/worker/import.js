"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.strlen = void 0;
const wasi_js_1 = __importDefault(require("wasi-js"));
const reuseInFlight_1 = __importDefault(require("../reuseInFlight"));
const instance_1 = __importDefault(require("./instance"));
const dylink_1 = __importStar(require("dylink"));
const trampoline_1 = __importDefault(require("./trampoline"));
const debug_1 = __importDefault(require("debug"));
const posix_context_1 = __importDefault(require("./posix-context"));
const log = (0, debug_1.default)("wasm-worker");
function strlen(charPtr, memory) {
    const mem = new Uint8Array(memory.buffer);
    let i = charPtr;
    while (mem[i]) {
        i += 1;
    }
    return i - charPtr;
}
exports.strlen = strlen;
const cache = {};
async function doWasmImport({ source, bindings, options = {}, importWebAssemblySync, importWebAssembly, readFileSync, maxMemoryMB, }) {
    log("doWasmImport", source);
    if (source == null) {
        throw Error("source must be defined");
    }
    if (cache[source] != null) {
        return cache[source];
    }
    const t = new Date().valueOf();
    const memory = new WebAssembly.Memory({
        initial: (0, dylink_1.MBtoPages)(10),
        ...(maxMemoryMB ? { maximum: (0, dylink_1.MBtoPages)(maxMemoryMB) } : {}),
    });
    const table = new WebAssembly.Table({ initial: 10000, element: "anyfunc" });
    const wasmEnv = {
        reportError: (ptr, len) => {
            // @ts-ignore
            const slice = memory.buffer.slice(ptr, ptr + len);
            const textDecoder = new TextDecoder();
            throw Error(textDecoder.decode(slice));
        },
    };
    // NOTE: if we want to try to use WebAssembly.Table for something,
    // then set env.__indirect_function_table to it.  The name
    // __indirect_function_table is the arbitrary hardcoded name that zig
    // just happens to use for the table it imports when you compile
    // with --import-table. I only figured this out by decompiling and reading. See
    // https://github.com/ziglang/zig/pull/10382/files#diff-e2879374d581d6e9422f4f6f09ae3c8ee5f429f7581d7b899f3863319afff4e0R648
    const wasmOpts = {
        env: {
            ...wasmEnv,
            ...options.wasmEnv,
            memory,
            __indirect_function_table: table,
        },
    };
    let wasm;
    if (wasmOpts.env.wasmGetSignalState == null) {
        console.warn("wasmGetSignalState not defined; using STUB");
        wasmOpts.env.wasmGetSignalState = () => {
            return 0;
        };
    }
    if (wasmOpts.env.wasmSendString == null) {
        // This sends a string from WebAssembly back to Typescript and places
        // it in the result variable.
        wasmOpts.env.wasmSendString = (ptr, len) => {
            wasm.result = wasm.recv.string(ptr, len);
        };
    }
    if (wasmOpts.env.wasmSetException == null) {
        wasmOpts.env.wasmSetException = () => {
            wasm.resultException = true;
        };
    }
    if (wasmOpts.env.getrandom == null) {
        // TODO: didn't need to do this get fixed in newer zig?
        wasmOpts.env.getrandom = (bufPtr, bufLen, _flags) => {
            // NOTE: returning 0 here (our default stub behavior)
            // would result in Python hanging on startup!
            bindings.randomFillSync(
            // @ts-ignore
            new Uint8Array(memory.buffer), bufPtr, bufLen);
            return bufLen;
        };
    }
    if (wasmOpts.env.main == null) {
        // TODO: this seems suspect
        wasmOpts.env.main = () => {
            return 0;
        };
    }
    if (wasmOpts.env._Py_emscripten == null) {
        // TODO: this seems suspect
        wasmOpts.env._Py_emscripten_runtime = () => {
            return 0;
        };
    }
    (0, trampoline_1.default)(table, wasmOpts.env);
    const { fs } = bindings;
    const wasiConfig = {
        preopens: { "/": "/" },
        bindings,
        args: process.argv,
        env: options.env,
        sleep: options.sleep,
        getStdin: options.getStdin,
        sendStdout: options.sendStdout,
        sendStderr: options.sendStderr,
    };
    const wasi = new wasi_js_1.default(wasiConfig);
    wasmOpts.wasi_snapshot_preview1 = wasi.wasiImport;
    const dylinkOptions = {
        importWebAssemblySync,
        importWebAssembly,
        readFileSync,
        stub: false,
    };
    const posixContext = new posix_context_1.default({
        memory,
        wasi,
        wasiConfig,
        noStdio: !!options.noStdio,
    });
    // This adds the posix functions into env *and* also adds socket
    // functionality to wasi_snapshot_preview1.
    posixContext.injectFunctions(wasmOpts);
    const instance = await (0, dylink_1.default)({
        ...dylinkOptions,
        path: source,
        importObject: wasmOpts,
    });
    if (wasi != null) {
        // wasi assumes this is called.
        wasi.start(instance, memory);
    }
    wasm = new instance_1.default(instance, memory, fs, table);
    posixContext.init(wasm);
    cache[source] = wasm;
    if (options.time && log.enabled) {
        log(`imported ${source} in ${new Date().valueOf() - t}ms`);
    }
    wasm.table = table;
    wasm.wasi = wasi;
    wasm.posixContext = posixContext;
    wasm.instance = instance;
    return wasm;
}
const wasmImport = (0, reuseInFlight_1.default)(doWasmImport, {
    createKey: (args) => args[0],
});
exports.default = wasmImport;
//# sourceMappingURL=import.js.map