"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IOProvider = exports.WasmInstanceAsync = exports.WasmInstanceSync = exports.Stream = void 0;
const events_1 = require("events");
var types_1 = require("./worker/types");
Object.defineProperty(exports, "Stream", { enumerable: true, get: function () { return types_1.Stream; } });
class WasmInstance extends events_1.EventEmitter {
    // kill and free up anything associated with this.  Any use
    // after calling this is not defined.
    terminate() {
        throw Error("not implemented");
    }
    writeToStdin(_data) {
        throw Error("not implemented");
    }
    // Wait until the filesystem is loaded enough to run user code.
    waitUntilFsLoaded() {
        throw Error("not implemented");
    }
    signal(_sig) {
        throw Error("not implemented");
    }
    // Get the current working directory.
    getcwd() {
        throw Error("not implemented");
    }
    // fetch the data at url and save it to path.
    async fetch(_url, _path, _mode) {
        throw Error("not implemented");
    }
}
class WasmInstanceSync extends WasmInstance {
    getFunction(_name, _dll) {
        throw Error("not implemented");
    }
    callWithString(_name, _str, ..._args) {
        throw Error("not implemented");
    }
    exec(_argv = ["command"]) {
        throw Error("not implemented");
    }
}
exports.WasmInstanceSync = WasmInstanceSync;
class WasmInstanceAsync extends WasmInstance {
    async callWithString(_name, _str, ..._args) {
        throw Error("not implemented");
    }
    async exec(_argv = ["command"]) {
        throw Error("not implemented");
    }
}
exports.WasmInstanceAsync = WasmInstanceAsync;
class IOProvider {
}
exports.IOProvider = IOProvider;
//# sourceMappingURL=types.js.map