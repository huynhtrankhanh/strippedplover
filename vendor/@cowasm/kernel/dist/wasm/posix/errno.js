"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nativeToWasm = void 0;
const constants_1 = __importDefault(require("./constants"));
function Errno(error) {
    const errno = constants_1.default[error];
    const err = Error(`Error ${error}  (errno=${errno}).`);
    err.wasiErrno = errno;
    return err;
}
exports.default = Errno;
// Return map from standard native error codes to
// WASM error codes.  These can be *very* different
// and have to be translated.
function nativeToWasm(posix) {
    // DO **NOT** add anything more to this, e.g., ENOTSUP, since we are making
    // a mapping back and forth usig it, and any overlaps will lead to subtle errors!
    const names = [
        "E2BIG",
        "EACCES",
        "EBADF",
        "EBUSY",
        "ECHILD",
        "EDEADLK",
        "EEXIST",
        "EFAULT",
        "EFBIG",
        "EINTR",
        "EINVAL",
        "EIO",
        "EISDIR",
        "EMFILE",
        "EMLINK",
        "ENFILE",
        "ENODEV",
        "ENOENT",
        "ENOEXEC",
        "ENOMEM",
        "ENOSPC",
        "ENOTDIR",
        "ENOTTY",
        "ENXIO",
        "EPERM",
        "EPIPE",
        "EROFS",
        "ESPIPE",
        "ESRCH",
        "ETXTBSY",
        "EXDEV",
    ];
    const map = {};
    for (const name of names) {
        const eNative = posix.constants?.[name];
        if (!eNative) {
            throw Error(`posix constant ${name} not known`);
        }
        const eWasm = constants_1.default[name];
        if (!eWasm) {
            throw Error(`wasm constant ${name} not known`);
        }
        map[eNative] = eWasm;
    }
    return map;
}
exports.nativeToWasm = nativeToWasm;
//# sourceMappingURL=errno.js.map