"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const constants_1 = __importDefault(require("./constants"));
const errno_1 = __importDefault(require("./errno"));
const util_1 = require("./util");
function stats({ fs, process, recv, wasi }) {
    function calculateAt(dirfd, path, allowEmpty = false) {
        if ((0, path_1.isAbsolute)("path")) {
            return path;
        }
        let dir;
        if (dirfd == constants_1.default.AT_FDCWD) {
            dir = process.cwd?.() ?? "/";
        }
        else {
            // it is a file descriptor
            const entry = wasi.FD_MAP.get(dirfd);
            if (!entry) {
                throw (0, errno_1.default)("EBADF");
            }
            dir = entry.path;
        }
        if (path.length == 0) {
            if (!allowEmpty) {
                throw (0, errno_1.default)("ENOENT");
            }
            return dir;
        }
        return (0, path_1.join)(dir, path);
    }
    // because wasi's structs don't have sufficient info to deal with permissions, we make ALL of these
    // chmods into stubs, below, despite having implemented them!
    // This in particular totally broke libgit2 working at all.
    // TODO: an alternative may be to always set the mode to 0777.  I'm not sure how bad that would be.
    return {
        chmod: (pathPtr, mode) => {
            return 0; // stubbed due to wasi shortcomings
            if (!mode) {
                // It is impossible for stat calls by wasi to return anything except 0 at present due to this bug:
                // See https://github.com/WebAssembly/wasi-filesystem/issues/34
                // Thus they will often then set the mode to 0, e.g., shutil.copy in python does this to all files.
                // In such cases, we silently make this a successful no-op instead of breaking everything horribly.
                // This comes up a lot with using Python as part of a build process.
                return 0;
            }
            const path = recv.string(pathPtr);
            fs.chmodSync(path, mode);
            return 0;
        },
        _fchmod: (fd, mode) => {
            return 0; // stubbed due to wasi shortcomings
            if (!mode) {
                // see above.
                return 0;
            }
            const entry = wasi.FD_MAP.get(fd);
            if (!entry) {
                console.warn("bad file descriptor, fchmod");
                return -1;
            }
            fs.fchmodSync(entry.real, mode);
            return 0;
        },
        // int fchmodat(int dirfd, const char *pathname, mode_t mode, int flags);
        fchmodat: (dirfd, pathPtr, mode, _flags) => {
            return 0; // stubbed due to wasi shortcomings
            if (!mode) {
                // see above.
                return 0;
            }
            /* "The fchmodat() system call operates in exactly the same way as chmod(2), except... If the
            pathname given in pathname is relative, then it is interpreted relative to the directory referred
            to by the file descriptor dirfd (rather than relative to the current working directory of the
            calling process, as is done by chmod(2) for a relative pathname).  If pathname is relative and
            dirfd is the special value AT_FDCWD, then pathname is interpreted relative to the current
            working directory of the calling process (like chmod(2)). If pathname is absolute, then dirfd
            is ignored.  This flag is not currently implemented."
           */
            const path = recv.string(pathPtr);
            const pathAt = calculateAt(dirfd, path);
            fs.chmodSync(pathAt, mode);
            return 0;
        },
        lchmod: (pathPtr, mode) => {
            return 0; // stubbed due to wasi shortcomings
            if (!mode) {
                // see above.
                return 0;
            }
            const path = recv.string(pathPtr);
            fs.lchmodSync(path, mode);
            return 0;
        },
        // mode_t umask(mode_t mask);
        umask: (mask) => {
            // we return 18 when there's no process.umask function, since that's
            // like umask 022, i.e., it's a reasonable default.
            return process.umask?.(mask) ?? 18;
        },
        // not in wasi and we haven't done it yet...
        mkfifo: () => {
            (0, util_1.notImplemented)("mkfifo");
        },
        mknod: () => {
            (0, util_1.notImplemented)("mknod");
        },
    };
}
exports.default = stats;
//# sourceMappingURL=stat.js.map