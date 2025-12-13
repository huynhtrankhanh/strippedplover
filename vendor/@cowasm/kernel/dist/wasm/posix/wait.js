"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
const constants_1 = __importDefault(require("./constants"));
function wait({ posix, send }) {
    function nativeOptions(options) {
        let native_options = 0;
        for (const option of ["WNOHANG", "WUNTRACED"]) {
            if (options & constants_1.default[option]) {
                native_options |= posix.constants[option];
            }
        }
        return native_options;
    }
    function wasm_wstatus(wstatus) {
        // TODO -- need to parse status and encode in wstatusPtr correctly.  I don't
        // know that wstatus native is the same as wstatus in WASI!!?!
        return wstatus;
    }
    const obj = {
        wait: (wstatusPtr) => {
            if (posix.wait == null) {
                (0, util_1.notImplemented)("wait");
            }
            const { ret, wstatus } = posix.wait();
            send.i32(wstatusPtr, wasm_wstatus(wstatus));
            return ret;
        },
        waitid: () => {
            // waitid is linux only
            (0, util_1.notImplemented)("waitid");
            return -1;
        },
        //  pid_t waitpid(pid_t pid, int *wstatus, int options);
        // waitpid(pid: number, options : number) => {status: Status, ret:number}
        waitpid: (pid, wstatusPtr, options) => {
            if (posix.waitpid == null) {
                (0, util_1.notImplemented)("waitpid");
            }
            // TODO -- need to parse status and encode in wstatusPtr correctly.  I don't
            // know that wstatus native is the same as wstatus in WASI!!?!
            const { ret, wstatus } = posix.waitpid(pid, nativeOptions(options));
            send.i32(wstatusPtr, wasm_wstatus(wstatus));
            return ret;
        },
        // pid_t wait3(int *stat_loc, int options, struct rusage *rusage);
        wait3: (wstatusPtr, options, rusagePtr) => {
            if (posix.wait3 == null) {
                (0, util_1.notImplemented)("wait3");
            }
            if (rusagePtr != 0) {
                console.warn("wait3 not implemented for non-NULL *rusage");
                (0, util_1.notImplemented)("wait3");
            }
            const { ret, wstatus } = posix.wait3(nativeOptions(options));
            send.i32(wstatusPtr, wasm_wstatus(wstatus));
            return ret;
        },
    };
    return obj;
}
exports.default = wait;
//# sourceMappingURL=wait.js.map