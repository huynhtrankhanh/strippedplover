"use strict";
/*
SANDBOXED VERSION: All spawn/subprocess operations are disabled to reduce attack surface.
All spawn system calls throw an error.
*/
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
function spawn(_context) {
    // All spawn operations are blocked in sandbox mode
    const blocked = () => (0, util_1.notImplemented)("spawn operations blocked in sandbox");
    return {
        posix_spawnattr_setschedparam: blocked,
        posix_spawnattr_getschedparam: blocked,
        posix_spawnattr_setschedpolicy: blocked,
        posix_spawnattr_getschedpolicy: blocked,
        posix_spawnattr_init: blocked,
        posix_spawnattr_destroy: blocked,
        posix_spawnattr_setflags: blocked,
        posix_spawnattr_getflags: blocked,
        posix_spawnattr_setpgroup: blocked,
        posix_spawnattr_getpgroup: blocked,
        posix_spawnattr_setsigmask: blocked,
        posix_spawnattr_getsigmask: blocked,
        posix_spawnattr_setsigdefault: blocked,
        posix_spawnattr_getsigdefault: blocked,
        posix_spawn: blocked,
        posix_spawnp: blocked,
        posix_spawn_file_actions_init: blocked,
        posix_spawn_file_actions_destroy: blocked,
        posix_spawn_file_actions_addclose: blocked,
        posix_spawn_file_actions_addopen: blocked,
        posix_spawn_file_actions_adddup2: blocked,
    };
}
exports.default = spawn;
//# sourceMappingURL=spawn.js.map