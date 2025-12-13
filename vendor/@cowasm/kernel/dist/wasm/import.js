"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WasmInstanceAbstractBaseClass = void 0;
const awaiting_1 = require("awaiting");
const events_1 = require("events");
const reuseInFlight_1 = __importDefault(require("./reuseInFlight"));
const send_to_wasm_1 = require("./worker/send-to-wasm");
const recv_from_wasm_1 = require("./worker/recv-from-wasm");
const types_1 = require("./types");
const constants_1 = require("./constants");
const debug_1 = __importDefault(require("debug"));
const MAX_OUTPUT_DELAY_MS = 250;
const log = (0, debug_1.default)("wasm-main");
// TODO: typescript actually has "export abstract class" !  No need to fake it...
// This implements WasmInstanceAsync from ./
class WasmInstanceAbstractBaseClass extends events_1.EventEmitter {
    constructor(wasmSource, options, IOProviderClass) {
        super();
        this.callId = 0;
        this.outputMonitorDelay = MAX_OUTPUT_DELAY_MS;
        log("constructor", options);
        this.wasmSource = wasmSource;
        this.options = options;
        this.init = (0, reuseInFlight_1.default)(this.init);
        this.send = new send_to_wasm_1.SendToWasmAbstractBase();
        this.recv = new recv_from_wasm_1.RecvFromWasmAbstractBase();
        this.ioProvider = new IOProviderClass();
    }
    signal(sig = constants_1.SIGINT) {
        this.ioProvider.signal(sig);
    }
    // MUST override in derived class
    initWorker() {
        abstract("initWorker");
        return null; // for typescript
    }
    writeToStdin(data) {
        log("writeToStdin", data);
        this.ioProvider.writeToStdin(Buffer.from(data));
        if (data.toString().includes("\u0003")) {
            this.signal(constants_1.SIGINT);
            // This is a hack, but for some reason everything feels better with this included:
            this.ioProvider.writeToStdin(Buffer.from("\n"));
        }
        setTimeout(() => {
            this.readOutput();
        }, 1);
    }
    async init() {
        if (this.worker)
            return;
        this.worker = this.initWorker();
        if (!this.worker)
            throw Error("init - bug");
        const options = { ...this.ioProvider.getExtraOptions(), ...this.options };
        log("options = ", options);
        this.worker.postMessage({
            event: "init",
            name: this.wasmSource,
            options,
            // debug: this passes the debug state from the main thread to the worker thread; otherwise,
            // we would have no way to ever see any debug logging from worker.  This is really nice!
            debug: debug_1.default.load(),
        });
        this.worker.on("exit", () => this.terminate());
        this.worker.on("message", (message) => {
            if (message == null)
                return;
            log("main thread got message", message);
            // This can be useful in some low-level debugging situations:
            //       if (message.event == "stderr" || message.event == "stdout") {
            //         console.warn(new TextDecoder().decode(message.data));
            //       }
            // message with id handled elsewhere -- used for getting data back.
            if (message.id != null) {
                // message with id handled elsewhere -- used for getting data back.
                this.emit("id", message);
                return;
            }
            switch (message.event) {
                case "init":
                    this.emit("init", message);
                    return;
                case "stdout":
                    this.emit("stdout", message.data);
                    break;
                case "stderr":
                    this.emit("stderr", message.data);
                    break;
            }
        });
        this.monitorOutput();
        await (0, awaiting_1.callback)((cb) => this.once("init", (message) => {
            cb(message.error);
        }));
    }
    async readOutput() {
        if (this.worker == null)
            return 0;
        const data = await this.ioProvider.readOutput();
        if (data.length > 0) {
            this.outputMonitorDelay = 1;
            this.emit(data[0] == types_1.Stream.STDOUT ? "stdout" : "stderr", data.subarray(1));
        }
        else {
            this.outputMonitorDelay = Math.min(MAX_OUTPUT_DELAY_MS, this.outputMonitorDelay * 1.3);
        }
        return data.length;
    }
    async monitorOutput() {
        while (this.worker != null) {
            await this.readOutput();
            await delay(this.outputMonitorDelay);
        }
    }
    terminate() {
        if (this.worker == null)
            return;
        const worker = this.worker;
        delete this.worker;
        worker.emit("exit");
        worker.terminate();
        worker.removeAllListeners();
        this.emit("terminate");
        this.removeAllListeners();
    }
    async callWithString(name, str, ...args) {
        await this.init();
        if (!this.worker) {
            throw Error(`callWithString (name=${JSON.stringify(name)}, str='${JSON.stringify(str)}') - worker is not running`);
        }
        this.callId += 1;
        this.worker.postMessage({
            id: this.callId,
            event: "callWithString",
            name,
            str,
            args,
        });
        return await this.waitForResponse(this.callId);
    }
    async waitUntilFsLoaded() {
        if (!this.worker) {
            throw Error(`waitUntilFsLoaded - bug; worker must be defined`);
        }
        this.callId += 1;
        this.worker.postMessage({
            id: this.callId,
            event: "waitUntilFsLoaded",
        });
        await this.waitForResponse(this.callId);
    }
    async waitForResponse(id) {
        return (await (0, awaiting_1.callback)((cb) => {
            const removeListeners = () => {
                this.removeListener("id", messageListener);
                this.removeListener("sigint", sigintListener);
            };
            const messageListener = (message) => {
                if (message.id == id) {
                    removeListeners();
                    if (message.error) {
                        cb(message.error);
                    }
                    else {
                        cb(undefined, message);
                    }
                }
            };
            this.on("id", messageListener);
            const sigintListener = () => {
                removeListeners();
                cb("KeyboardInterrupt");
            };
            this.once("sigint", sigintListener);
            this.worker?.on("exit", () => {
                removeListeners();
                cb("exit");
            });
        })).result;
    }
    // Optionally override in derived class
    configureTerminal() { }
    async exec(argv = ["command"]) {
        await this.init();
        if (this.worker == null)
            throw Error("exec: bug - worker must be defined");
        if (!this.options.noStdio) {
            this.configureTerminal();
        }
        let r = 0;
        try {
            r = await this.callWithString("cowasm_exec", argv);
            this.terminate();
        }
        catch (_) {
            // expected to fail -- call doesn't get output...
        }
        return r;
    }
    getFunction(_name, _dll) {
        throw Error("not implemented");
    }
    getcwd() {
        throw Error("not implemented");
    }
    async fetch(url, path, mode) {
        if (this.worker == null)
            throw Error("fetch: bug - worker must be defined");
        this.callId += 1;
        this.worker.postMessage({
            id: this.callId,
            event: "fetch",
            url,
            path,
            mode,
        });
        await this.waitForResponse(this.callId);
    }
}
exports.WasmInstanceAbstractBaseClass = WasmInstanceAbstractBaseClass;
function abstract(name) {
    throw Error(`${name} -- must be defined in derived class`);
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
//# sourceMappingURL=import.js.map