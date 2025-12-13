"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const debug_1 = __importDefault(require("debug"));
const types_1 = require("./types");
const log = (0, debug_1.default)("wasm:worker:init");
function initWorker({ wasmImport, parent, captureOutput, IOHandler, }) {
    let wasm = undefined;
    async function handleMessage(message) {
        log("worker got message ", message);
        switch (message.event) {
            case "init":
                const ioHandler = new IOHandler(message.options, () => {
                    parent.postMessage({ event: "service-worker-broken" });
                });
                if (message.debug) {
                    // Enable debug logging to match main thread.  Otherwise, there is no possible
                    // way to have any logging inside the WebWorker.
                    debug_1.default.enable(message.debug);
                }
                const opts = {
                    ...message.options,
                    sleep: ioHandler.sleep.bind(ioHandler),
                    getStdin: ioHandler.getStdin.bind(ioHandler),
                    wasmEnv: {
                        wasmGetSignalState: ioHandler.getSignalState.bind(ioHandler),
                    },
                };
                if (captureOutput || message.options.noStdio) {
                    opts.sendStdout = (data) => {
                        ioHandler.sendOutput(types_1.Stream.STDOUT, data);
                    };
                    opts.sendStderr = (data) => {
                        ioHandler.sendOutput(types_1.Stream.STDERR, data);
                    };
                }
                wasm = await wasmImport(message.name, opts);
                return { event: "init", status: "ok" };
            case "callWithString":
                if (wasm == null) {
                    throw Error("wasm must be initialized");
                }
                return {
                    result: wasm.callWithString(message.name, message.str, // this is a string or string[]
                    ...message.args),
                };
            case "call":
                if (wasm == null) {
                    throw Error("wasm must be initialized");
                }
                return {
                    result: wasm.callWithString(message.name, "", []),
                };
            case "waitUntilFsLoaded":
                if (wasm?.fs == null) {
                    throw Error("wasm.fs must be initialized");
                }
                // it might not be defined, e.g., if not using unionfs at all
                const { waitUntilLoaded } = wasm.fs;
                if (waitUntilLoaded == null) {
                    log("waitUntilLoaded - no wait function defined");
                }
                else {
                    await waitUntilLoaded();
                    log("waited and now file system");
                }
                if (log.enabled) {
                    // takes effort
                    log("ls / = ", wasm.fs.readdirSync("/"));
                }
                return;
            case "fetch":
                if (wasm?.fs == null) {
                    throw Error("wasm.fs must be initialized");
                }
                await wasm.fetch(message.url, message.path, message.mode);
                return;
        }
    }
    parent.on("message", async (message) => {
        try {
            const resp = {
                id: message.id,
                ...(await handleMessage(message)),
            };
            parent.postMessage(resp);
        }
        catch (error) {
            parent.postMessage({
                id: message.id,
                error,
            });
        }
    });
}
exports.default = initWorker;
//# sourceMappingURL=init.js.map