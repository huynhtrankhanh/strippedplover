"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("posix:stdlib");
function stdlib({ child_process, os, recv, send, fs }) {
    return {
        setjmp: () => {
            // Return 0 so it doesn't do the failure care of the setjmp.
            log("STUB: setjmp - no op");
            return 0;
        },
        // void longjmp(jmp_buf env, int val);
        longjmp: () => {
            log("STUB: longjmp - no op");
            return 0;
        },
        siglongjmp: () => {
            log("STUB: siglongjmp - no op");
            return 0;
        },
        sigsetjmp: () => {
            log("STUB: sigsetjmp - no op");
            return 0;
        },
        // int getloadavg(double loadavg[], int nelem);
        getloadavg: (loadavgDoubleArrayPtr, nelem) => {
            const { loadavg } = os;
            if (loadavg == null) {
                // load average is not attainable
                return -1;
            }
            const avg = loadavg();
            send.f64(loadavgDoubleArrayPtr, avg[0]);
            send.f64(loadavgDoubleArrayPtr + 8, avg[1]); // double = 8 bytes in WASM
            send.f64(loadavgDoubleArrayPtr + 16, avg[2]);
            // number of samples (not provided by loadavg).  In python itself if you don't get
            // all of them (3 are requested), it just gives an error.
            return nelem;
        },
        // SANDBOXED: system() removed - shell command execution is not allowed
        // int system(const char *command);
        system: (commandPtr) => {
            (0, util_1.notImplemented)("system: sandbox restricted");
        },
        // char *realpath(const char *path, char *resolved_path);
        realpath: (pathPtr, resolvedPathPtr) => {
            try {
                const path = recv.string(pathPtr);
                log("realpath", { path });
                const resolvedPath = fs.realpathSync(path);
                return send.string(resolvedPath, { ptr: resolvedPathPtr, len: 4096 });
            }
            catch (err) {
                log("realpath error ", err);
                // It can be normal to check for a file that doesn't exist only console.warn in case of low level debugging.
                // console.warn("ERROR", err);
                // return 0 to indicate error, NOT -1!
                return 0;
            }
        },
        /*
        We need mkstemp since it used in editline/readline.c to do history file truncation.
        (Python doesn't use this since it has its own implementation.)
        */
        // Commented out since we have a C implementation in stdlib.c; the one below should work fine though...?
        /*
        mkstemp: (templatePtr: number): number => {
          let template = recv.string(templatePtr);
          // template ends in XXXXXX
          if (template.slice(-6) != "XXXXXX") {
            throw Error("template must end in XXXXXX");
          }
          // the algorithm in musl is to try 100 randomizations of the last 6 characters
          let retries = 100;
          while (retries > 0) {
            // See https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
            template =
              template.slice(0, -6) +
              (Math.random().toString(36) + "00000000000000000").slice(2, 8);
            try {
              return fs.openSync(
                template,
                fs.constants?.O_RDWR | fs.constants?.O_CREAT | fs.constants?.O_EXCL,
                0o600
              );
            } catch (err) {
              retries -= 1;
              if (retries == 0) {
                console.warn(err);
              }
            }
          }
          // failed
          return -1;
        },
        */
    };
}
exports.default = stdlib;
//# sourceMappingURL=stdlib.js.map