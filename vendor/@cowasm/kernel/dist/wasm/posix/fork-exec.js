"use strict";
/*
SANDBOXED VERSION: All fork/exec operations are disabled to reduce attack surface.
All fork-exec system calls throw an error or return -1.
*/
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
function fork_exec(_context) {
    // All fork/exec operations are blocked in sandbox mode
    return {
        python_wasm_set_inheritable: () => {
            (0, util_1.notImplemented)("fork/exec operations blocked in sandbox");
            return -1;
        },
        python_wasm_fork_exec: () => {
            (0, util_1.notImplemented)("fork/exec operations blocked in sandbox");
            return -1;
        },
        cowasm_vforkexec: () => {
            (0, util_1.notImplemented)("fork/exec operations blocked in sandbox");
            return 127;
        },
    };
}
exports.default = fork_exec;
//# sourceMappingURL=fork-exec.js.map