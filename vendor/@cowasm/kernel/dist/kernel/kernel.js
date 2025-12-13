"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSyncKernel = exports.createAsyncKernel = void 0;
async function createAsyncKernel({ wasmSource, wasmImport, fs, env, noStdio, }) {
    const kernel = (await wasmImport(wasmSource, {
        env,
        fs,
        noStdio,
    }));
    // critical to do this first, because otherwise process.cwd() gets
    // set to '/' (the default in WASM) when any posix call happens.
    await kernel.callWithString("chdir", process.cwd());
    return kernel;
}
exports.createAsyncKernel = createAsyncKernel;
async function createSyncKernel({ wasmSource, wasmImport, fs, env, wasmEnv, }) {
    const kernel = (await wasmImport(wasmSource, {
        env,
        fs,
        wasmEnv,
    }));
    kernel.callWithString("chdir", process.cwd());
    return kernel;
}
exports.createSyncKernel = createSyncKernel;
//# sourceMappingURL=kernel.js.map