"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const posix_1 = __importDefault(require("../posix"));
const send_to_wasm_1 = __importDefault(require("./send-to-wasm"));
const recv_from_wasm_1 = __importDefault(require("./recv-from-wasm"));
const lodash_1 = require("lodash");
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("kernel:posix-context");
class PosixContext {
    constructor({ wasiConfig, memory, wasi, noStdio }) {
        log("noStdio", noStdio);
        this.memory = memory;
        this.wasi = wasi;
        this.wasiConfig = wasiConfig;
        const { bindings, sleep } = wasiConfig;
        const callFunction = this.callFunction.bind(this);
        const callWithString = this.callWithString.bind(this);
        this.posixEnv = this.createPosixEnv({
            memory,
            wasi,
            bindings,
            callFunction,
            callWithString,
            sleep,
            noStdio,
        });
    }
    createPosixEnv({ bindings, memory, wasi, callFunction, callWithString, sleep, noStdio, }) {
        this.context = {
            state: {},
            fs: bindings.fs,
            send: new send_to_wasm_1.default({ memory, callFunction }),
            recv: new recv_from_wasm_1.default({ memory, callFunction }),
            wasi,
            run: this.run.bind(this),
            process,
            os: bindings.os ?? {},
            posix: bindings.posix ?? {},
            child_process: bindings.child_process ?? {},
            memory,
            callFunction,
            callWithString,
            getcwd: this.getcwd.bind(this),
            free: this.free.bind(this),
            sleep,
            noStdio,
        };
        return (0, posix_1.default)(this.context);
    }
    init(wasm) {
        this.wasm = wasm;
        this.posixEnv.init();
    }
    // set all the posix functions in env, but do NOT overwrite
    // anything that is already set.  Also, add socket functionality
    // to wasi.
    injectFunctions({ env, wasi_snapshot_preview1, }) {
        for (const name in this.posixEnv) {
            if (env[name] == null) {
                env[name] = this.posixEnv[name];
            }
        }
        // Add socket functionality to WASI.  This just works around
        // that there is a tiny amount in wasi v0 itself and we have
        // to replace it.  Someday wasi may have more that we have
        // to replace or implement.  See
        //    https://github.com/WebAssembly/wasi-sockets/
        for (const name of [
            "recv",
            "send",
            "shutdown",
            "fcntlSetFlags",
            "pollSocket",
        ]) {
            if (this.posixEnv[name] != null) {
                wasi_snapshot_preview1[`sock_${name}`] = this.posixEnv[name];
            }
        }
    }
    callWithString(func, str, ...args) {
        if (this.wasm == null) {
            throw Error("wasm must be define");
        }
        return this.wasm.callWithString(func, str, ...args);
    }
    callFunction(name, ...args) {
        if (this.wasm == null) {
            throw Error("wasm must be define");
        }
        const f = this.wasm.getFunction(name);
        if (f == null) {
            throw Error(`error - ${name} is not defined`);
        }
        return f(...args);
    }
    getcwd() {
        if (this.wasm == null) {
            throw Error("wasm must be define");
        }
        if (this.wasm.getcwd == null) {
            throw Error(`error - getcwd is not defined`);
        }
        return this.wasm.getcwd();
    }
    free(ptr) {
        this.wasm?.exports.c_free(ptr);
    }
    run(args) {
        log("run", args);
        const { wasm } = this;
        if (wasm == null) {
            throw Error("wasm must be define");
        }
        const path = args[0];
        if (path == null) {
            throw Error("args must have length at least 1");
        }
        // save memory and function caching context
        const state = {
            memory: new Uint8Array(this.memory.buffer).slice(),
            context: this.context.state,
            wasi: this.wasi.getState(),
            exit: this.wasiConfig.bindings.exit,
            dlopen: wasm.instance.getDlopenState(),
        };
        // I wonder if I could use immer.js instead for any of this?  It might be slower.
        this.context.state = (0, lodash_1.cloneDeep)(state.context);
        const wasi_state = (0, lodash_1.cloneDeep)(state.wasi);
        let return_code = -1; // not set ==> something went wrong since exit never called.
        wasi_state.bindings.exit = (code) => {
            // uncomment this for debugging only
            // console.trace(`exit(${code}) called`);
            return_code = code;
            // after this, the main call below throws an exception
            // then the return_code gets returned right after the
            // finally cleansthings up.
        };
        try {
            this.wasi.setState(wasi_state);
            let main;
            try {
                // this does dlopen of args[0]:
                main = wasm.getFunction("__main_argc_argv", args[0]);
                if (main == null) {
                    throw Error("__main_argc_argv is null");
                }
            }
            catch (_err) {
                try {
                    main = wasm.getFunction("main", args[0]);
                    if (main == null) {
                        throw Error("main and __main_argc_argv are both null");
                    }
                }
                catch (err) {
                    console.error(`${args[0]}: ${err}`);
                    return 127;
                }
            }
            try {
                return main(args.length, wasm.send.arrayOfStrings(args));
            }
            catch (err) {
                if (return_code == -1) {
                    // code did not get set -- something crashed badly.
                    console.error(args[0], err);
                    return 139; // segfault return code.
                }
            }
            if (return_code == -1) {
                // code did not get set -- something bad?
                return 139; // segfault return code.
            }
            return return_code;
        }
        finally {
            // Free up tables allocated to the dynamic library in Javascript memory. These
            // would persist even after resetting memory below, which would break everything.
            wasm.instance.setDlopenState(state.dlopen);
            // Restore memory to how it was before running the subprocess.
            // This of course safely frees up and undoes all changes made to
            // the memory when running code.
            new Uint8Array(this.memory.buffer).set(state.memory);
            // Restore posix context to before running the subprocess.
            this.context.state = state.context;
            this.wasi.setState(state.wasi);
        }
    }
}
exports.default = PosixContext;
//# sourceMappingURL=posix-context.js.map