"use strict";
/*

NOTES:
  - emscripten/src/library_syscall.js is useful inspiration in some cases!
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fork_exec_1 = __importDefault(require("./fork-exec"));
const epoll_1 = __importDefault(require("./epoll"));
const netdb_1 = __importDefault(require("./netdb"));
const netif_1 = __importDefault(require("./netif"));
const other_1 = __importDefault(require("./other"));
const sched_1 = __importDefault(require("./sched"));
const signal_1 = __importDefault(require("./signal"));
const socket_1 = __importDefault(require("./socket"));
const spawn_1 = __importDefault(require("./spawn"));
const stdlib_1 = __importDefault(require("./stdlib"));
const stdio_1 = __importDefault(require("./stdio"));
const stat_1 = __importDefault(require("./stat"));
const termios_1 = __importDefault(require("./termios"));
const time_1 = __importDefault(require("./time"));
const unistd_1 = __importDefault(require("./unistd"));
const wait_1 = __importDefault(require("./wait"));
const constants_1 = require("./constants");
const constants_2 = __importDefault(require("./constants"));
const debug_1 = __importDefault(require("debug"));
const logNotImplemented = (0, debug_1.default)("posix:not-implemented");
const logCall = (0, debug_1.default)("posix:call");
const logReturn = (0, debug_1.default)("posix:return");
const logError = (0, debug_1.default)("posix:error");
// For some reason this code
//    import os; print(os.popen('ls').read())
// hangs when run in **linux only** under python-wasm, but not python-wasm-debug,
// except if I set any random env variable here... and then it doesn't hang.
// This is weird.
process.env.__STUPID_HACK__ = "";
function posix(context) {
    const P = {
        ...(0, epoll_1.default)(context),
        ...(0, fork_exec_1.default)(context),
        ...(0, netdb_1.default)(context),
        ...(0, netif_1.default)(context),
        ...(0, other_1.default)(context),
        ...(0, sched_1.default)(context),
        ...(0, signal_1.default)(context),
        ...(0, socket_1.default)(context),
        ...(0, spawn_1.default)(context),
        ...(0, stat_1.default)(context),
        ...(0, stdlib_1.default)(context),
        ...(0, stdio_1.default)(context),
        ...(0, time_1.default)(context),
        ...(0, termios_1.default)(context),
        ...(0, unistd_1.default)(context),
        ...(0, wait_1.default)(context),
    };
    const Q = {};
    let nativeErrnoToSymbol = {};
    if (context.posix.constants != null) {
        for (const symbol in context.posix.constants) {
            nativeErrnoToSymbol[context.posix.constants[symbol]] = symbol;
        }
    }
    function setErrnoFromNative(nativeErrno, name, args) {
        if (nativeErrno == 0 || isNaN(nativeErrno)) {
            // TODO: could put a log or something in that name raised error with no code.
            context.callFunction("setErrno", nativeErrno);
            return;
        }
        // The error code comes from native posix, so we translate it to WASI first
        const symbol = nativeErrnoToSymbol[nativeErrno];
        if (symbol != null) {
            const wasiErrno = constants_2.default[symbol];
            if (wasiErrno != null) {
                if (logError.enabled) {
                    logError({ name, nativeErrno, wasiErrno, symbol, args });
                }
                context.callFunction("setErrno", wasiErrno);
                return;
            }
        }
        const mesg = symbol != null
            ? `WARNING in posix '${name}': Unable to map nativeErrno ${nativeErrno}: add ${symbol} to WASM posix constants in @cowasm/kernel`
            : `WARNING in posix '${name}': Unable to map nativeErrno ${nativeErrno}: add native symbol corresponding to errno=${nativeErrno} to the posix-node package`;
        console.warn(mesg);
        logNotImplemented(mesg);
    }
    // It's critical to ensure the directories of the host env is the same as
    // the WASM env, if meaningful or possible.  This only matters right now
    // under node.js, but is really critical there.  Thus we wrap *all* posix calls
    // in this syncdir below.
    //    TODO: optimize.  This seems dangerously expensive.
    let syncdir;
    if (context.posix.chdir != null) {
        syncdir = () => {
            // TODO: it is expected that this may fail, e.g., if we are using a sandbox filesystem
            // deal with this in a better way.
            try {
                context.posix.chdir?.(context.getcwd());
            }
            catch (_err) { }
        };
    }
    else {
        syncdir = () => { };
    }
    for (const name in P) {
        Q[name] = (...args) => {
            syncdir();
            try {
                logCall(name, args);
                const ret = P[name](...args);
                logReturn(name, ret);
                return ret;
            }
            catch (err) {
                logError(name, err);
                if (err.wasiErrno != null) {
                    context.callFunction("setErrno", err.wasiErrno);
                }
                else if (err.code != null) {
                    setErrnoFromNative(parseInt(err.code), name, args);
                }
                else {
                    // err.code not yet set (TODO), so we log and try heuristic.
                    // On error, for now -1 is returned, and errno should get set to some sort of error indicator
                    // TODO: how should we set errno?
                    // @ts-ignore -- this is just temporary while we sort out setting errno...
                    if (err.name == "NotImplementedError") {
                        // ENOSYS means "Function not implemented (POSIX.1-2001)."
                        context.callFunction("setErrno", constants_2.default.ENOSYS);
                    }
                    else {
                        console.trace(`WARNING: Posix library call to ${name} raised exception without error code.  The raised error is '${err}'`);
                        logNotImplemented(`Posix call to ${name} raised exception without error code`, err);
                    }
                }
                return err.ret ?? -1;
            }
        };
    }
    Q.init = () => {
        (0, constants_1.initConstants)(context);
    };
    return Q;
}
exports.default = posix;
//# sourceMappingURL=index.js.map