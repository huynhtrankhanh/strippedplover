"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const send_to_wasm_1 = __importDefault(require("./send-to-wasm"));
const recv_from_wasm_1 = __importDefault(require("./recv-from-wasm"));
const awaiting_1 = require("awaiting");
const path_1 = require("path");
const encoder = new TextEncoder();
// Massive optimization -- when calling a WASM function via
// callWithString (so first arg is a string), we reuse the
// same string buffer every time as long as the string is
// at most 8KB.  This avoids tons of mallocs, frees, saves
// memory, and gives an order of magnitude speedup.
const SMALL_STRING_SIZE = 1024 * 8;
class WasmInstanceSync extends events_1.EventEmitter {
    constructor(instance, memory, fs, table) {
        super();
        this.result = undefined;
        this.resultException = false;
        // functions never go away and getFunction is expensive if
        // it has to use the table, and same function gets called often,
        // so this is well worth doing.
        this._getFunctionCache = {};
        this.exports = instance.exports;
        this.instance = instance;
        this.memory = memory;
        this.table = table;
        this.fs = fs;
        const opts = {
            memory: this.memory,
            callFunction: (name, ...args) => {
                const f = this.getFunction(name);
                if (f == null) {
                    throw Error(`error - ${name} is not defined`);
                }
                return f(...args);
            },
            callWithString: this.callWithString.bind(this),
        };
        this.send = new send_to_wasm_1.default(opts);
        this.recv = new recv_from_wasm_1.default(opts);
    }
    terminate() {
        // nothing to do, since nothing can possibly be *running* when this is called.
    }
    exec(argv = ["command"]) {
        return this.callWithString("cowasm_exec", argv);
    }
    writeToStdin(_data) {
        throw Error("not implemented");
    }
    // When you pass str of type str[] it calls name with (len(str), char**, ...).
    // i.e., it's the main call signature than than null terminate char** like some
    // C library code.
    callWithString(func, str, ...args) {
        let f = undefined;
        if (typeof func == "string") {
            f = this.getFunction(func);
        }
        else if (typeof func == "object") {
            f = this.getFunction(func.name, func.dll);
        }
        else {
            f = func;
        }
        if (f == null) {
            throw Error(`no function "${typeof func == "object" ? JSON.stringify(func) : func}" defined in wasm module`);
        }
        this.result = undefined;
        this.resultException = false;
        let r;
        if (str == null) {
            // just calling it.
            r = f();
        }
        else if (typeof str == "string") {
            const strAsArray = encoder.encode(str);
            if (strAsArray.length < SMALL_STRING_SIZE) {
                r = this.callWithSmallString(f, strAsArray);
                return this.result ?? r;
            }
            const ptr = this.send.encodedString(strAsArray);
            try {
                // @ts-ignore
                r = f(ptr, ...args);
            }
            finally {
                // @ts-ignore
                this.exports.c_free(ptr);
            }
        }
        else {
            // TODO: solve problem in more generality, obviously!
            // Convert array of strings to char** of null terminated
            // strings, with a null char* at the end as well (common for clib functions)
            const ptrs = [];
            for (const s of str) {
                ptrs.push(this.send.string(s));
            }
            const len = ptrs.length;
            const ptr = this.exports.c_malloc((len + 1) * 4); // sizeof(char*) = 4 in WASM.
            const array = new Int32Array(this.memory.buffer, ptr, len + 1);
            let i = 0;
            for (const p of ptrs) {
                array[i] = p;
                i += 1;
            }
            array[len] = 0; // final null pointer.
            try {
                // @ts-ignore
                r = f(len, ptr, ...args);
            }
            finally {
                // @ts-ignore
                this.exports.c_free(ptr);
                for (const p of ptrs) {
                    this.exports.c_free(p);
                }
            }
        }
        if (this.resultException) {
            throw Error("RuntimeError");
        }
        return this.result ?? r;
    }
    getSmallStringPtr() {
        if (this.smallStringPtr == null) {
            this.smallStringPtr = this.exports.c_malloc(SMALL_STRING_SIZE);
            if (!this.smallStringPtr) {
                throw Error("MemoryError -- out of memory allocating small string buffer");
            }
        }
        return this.smallStringPtr;
    }
    callWithSmallString(f, strAsArray, ...args) {
        const ptr = this.getSmallStringPtr();
        const len = strAsArray.length + 1;
        const array = new Int8Array(this.memory.buffer, ptr, len);
        array.set(strAsArray);
        array[len - 1] = 0;
        return f(ptr, ...args);
    }
    // - If dll is not given gets a function from the main instance
    //   or undefined if the function is not defined. Result is cached.
    // - If dll is given, loads the given dynamic library (if it isn't
    //   already loaded), then gets the named function from there.  In the
    //   dll case throws an error explaining what went wrong if anything
    //   goes wrong, rather than undefined (since a lot can go wrong).
    //   TODO: maybe getFunction should throw instead of returning undefined
    //   in all cases?  Result is NOT cached, since dlclose+cache = crash.
    getFunction(name, dll) {
        if (dll != null) {
            return this.getFunctionUsingDlopen(name, dll);
        }
        let f = this._getFunctionCache[name];
        if (f != null) {
            return f;
        }
        if (this.table != null) {
            // first try pointer:
            const getPtr = this.exports[`__WASM_EXPORT__${name}`];
            if (getPtr != null) {
                f = this.table.get(getPtr());
                if (f != null) {
                    this._getFunctionCache[name] = f;
                    return f;
                }
            }
        }
        f = this.exports[name] ?? this.instance.env[name];
        this._getFunctionCache[name] = f;
        return f;
    }
    // Opens dynamic library if not already open, then gets the function.
    // Throws errors if anything doesn't exist or work.
    getFunctionUsingDlopen(name, path) {
        const handle = this.callWithString("dlopen", path);
        const dlsym = this.getFunction("dlsym");
        if (dlsym == null) {
            throw Error("dlsym must be defined");
        }
        const ptr = this.getSmallStringPtr();
        this.send.string(name, { ptr, len: SMALL_STRING_SIZE });
        const fPtr = dlsym(handle, ptr);
        return this.table?.get(fPtr);
    }
    closeDynamicLibrary(path) {
        const handle = this.callWithString("dlopen", path);
        if (handle != 0) {
            const dlclose = this.getFunction("dlclose");
            if (dlclose == null) {
                // should definitely never happen
                throw Error("dlclose not defined");
            }
            dlclose(handle);
        }
    }
    // Get the current working directory in the WASM instance.
    // The motivation for implementing this and ensuring it is fast
    // is that we need it when calling things like exec in our
    // posix compat layer, since we must ensure the host runtime
    // has the same working directory before any posix call that
    // uses the host.
    getcwd() {
        const getcwd = this.getFunction("getcwd");
        if (getcwd == null) {
            // this should be enforced by dylink and libc.
            throw Error("C library function getcwd must be exported");
        }
        return this.recv.string(getcwd(this.getSmallStringPtr(), SMALL_STRING_SIZE));
    }
    async waitUntilFsLoaded() {
        if (this.fs == null) {
            throw Error("fs must be defined");
        }
        // it might not be defined, e.g., if not using unionfs at all
        return await this.fs.waitUntilLoaded?.();
    }
    signal(_sig) {
        throw Error("not implemented");
    }
    async fetch(url, path, mode) {
        // TODO: this can't work in older versions of node... but also we should probably only
        // use fetch in the browser.  Could require clarification or the node-fetch module.
        const data = await (await fetch(url)).arrayBuffer();
        const { fs } = this;
        if (fs == null) {
            throw Error("fs must be defined");
        }
        const dir = (0, path_1.dirname)(path);
        await (0, awaiting_1.callback)((cb) => {
            fs.mkdir(dir, { recursive: true }, cb);
        });
        await (0, awaiting_1.callback)((cb) => {
            fs.writeFile(path, Buffer.from(data), cb);
        });
        if (mode) {
            // set file mode, typically for executables
            await (0, awaiting_1.callback)((cb) => {
                fs.chmod(path, mode, cb);
            });
        }
    }
}
exports.default = WasmInstanceSync;
//# sourceMappingURL=instance.js.map