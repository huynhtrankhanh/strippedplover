"use strict";
/*
python-wasm [--no-bundle] [--worker] ...
*/
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const node_1 = require("./node");
const kernel_1 = require("../../@cowasm/kernel");
async function main() {
    const PYTHONEXECUTABLE = (0, path_1.resolve)(process.argv[1]);
    const { noBundle, worker } = processArgs(process.argv);
    if (process.platform == "win32") {
        console.log("Press enter a few times.");
    }
    const options = { env: { PYTHONEXECUTABLE }, interactive: true };
    if (!noBundle) {
        options.fs = "everything";
    }
    const Python = worker ? node_1.asyncPython : node_1.syncPython;
    const python = await Python(options);
    const argv = [PYTHONEXECUTABLE].concat(process.argv.slice(2));
    let r = 0;
    try {
        // in async mode the worker thread itself just gets killed, e.g., when python runs
        // import sys; sys.exit(1) and that triggers "this.worker?.on("exit", () => {" in
        // packages/kernel/src/wasm/import.ts.  We don't get back an exit code, and I don't
        // yet know how to get it. This is another drawback of using a worker thread with node.
        r = await python.terminal(argv);
    }
    catch (_err) { }
    if (argv.includes("-h")) {
        console.log("\npython-wasm [--worker] [--no-bundle] ...");
        console.log("--worker : use a worker thread, instead of single threaded version (NOTE: exit code is always 0)");
        console.log("--no-bundle : do not use the python bundle archive (only for development)");
    }
    process.exit(r);
}
function processArgs(argv) {
    const i = argv.indexOf("--no-bundle");
    const noBundle = i != -1;
    if (noBundle) {
        argv.splice(i, 1);
    }
    const j = argv.indexOf("--worker");
    if (j != -1) {
        argv.splice(j, 1);
    }
    let worker = false;
    if (!(0, kernel_1.supportsPosix)()) {
        worker = true;
    }
    else {
        worker = j != -1;
    }
    return { noBundle, worker };
}
main();
//# sourceMappingURL=node-terminal.js.map