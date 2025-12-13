"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const node_1 = require("./node");
const posix_node_1 = __importDefault(require("posix-node"));
async function main() {
    if (process.argv.length <= 2) {
        console.error(`Usage: cowasm program [args ...]`);
        process.exit(1);
    }
    // TODO: could get asyncKernel instead via command line option or env variable (?)
    const kernel = await (0, node_1.syncKernel)();
    const program = (0, path_1.resolve)(process.argv[2]);
    const argv = [program].concat(process.argv.slice(3));
    try {
        posix_node_1.default.enableRawInput?.();
    }
    catch (_err) {
        // this will fail if stdin is not interactive; that's fine.
        try {
            posix_node_1.default.makeStdinBlocking?.();
        }
        catch (_err) { }
    }
    const r = kernel.exec(argv);
    process.exit(r);
}
main();
//# sourceMappingURL=node-terminal.js.map