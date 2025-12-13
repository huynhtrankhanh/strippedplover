"use strict";
/*
SANDBOXED VERSION: Fork/exec operations are no-ops to reduce attack surface.
Subprocesses cannot be created but the operations don't fail.
*/
Object.defineProperty(exports, "__esModule", { value: true });
function fork_exec(_context) {
    // Fork/exec operations are no-ops in sandbox mode
    return {
        // Allow set_inheritable to succeed (no-op) - needed during Python init
        python_wasm_set_inheritable: () => {
            return 0;
        },
        // Fork/exec returns -1 (failure) but doesn't throw
        python_wasm_fork_exec: () => {
            return -1;
        },
        // vforkexec returns 127 (command not found) but doesn't throw
        cowasm_vforkexec: () => {
            return 127;
        },
    };
}
exports.default = fork_exec;
//# sourceMappingURL=fork-exec.js.map