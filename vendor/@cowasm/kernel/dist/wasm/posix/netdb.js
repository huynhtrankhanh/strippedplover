"use strict";
/*
SANDBOXED VERSION: All network database operations are disabled to reduce attack surface.
Functions from netdb - now all operations throw not implemented errors.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSockaddr = exports.wasmToNativeSocktype = exports.nativeToWasmFamily = exports.wasmToNativeFamily = void 0;
const util_1 = require("./util");
const constants_1 = __importDefault(require("./constants"));
function netdb({ send }) {
    // All network database operations are blocked in sandbox mode
    const names = "getprotobyname getservbyname getservbyport getnameinfo gethostbyname gethostbyaddr getaddrinfo gai_strerror hstrerror";
    const netdb = {};
    for (const name of names.split(/\s+/)) {
        netdb[name] = () => (0, util_1.notImplemented)(name);
    }
    let h_errno_ptr = null;
    netdb.__h_errno_location = () => {
        if (h_errno_ptr == null) {
            h_errno_ptr = send.malloc(4);
            send.i32(h_errno_ptr, 0);
        }
        if (h_errno_ptr == null)
            throw Error("bug");
        return h_errno_ptr;
    };
    return netdb;
}
exports.default = netdb;
function wasmToNativeFamily(posix, family) {
    if (family == 0)
        return family;
    if (family == constants_1.default.AF_INET) {
        return posix.constants.AF_INET;
    }
    else if (family == constants_1.default.AF_INET6) {
        return posix.constants.AF_INET6;
    }
    else {
        throw Error(`unsupported WASM address family: ${family}`);
    }
}
exports.wasmToNativeFamily = wasmToNativeFamily;
function nativeToWasmFamily(posix, family) {
    if (family == 0)
        return family;
    if (family == posix.constants.AF_INET) {
        return constants_1.default.AF_INET;
    }
    else if (family == posix.constants.AF_INET6) {
        return constants_1.default.AF_INET6;
    }
    else {
        throw Error(`unsupported native address family: ${family}`);
    }
}
exports.nativeToWasmFamily = nativeToWasmFamily;
function wasmToNativeSocktype(posix, socktype) {
    if (!socktype)
        return socktype;
    let nativeSocktype = 0;
    for (const name in constants_1.default) {
        if (name.startsWith("SOCK") && constants_1.default[name] & socktype) {
            if (posix.constants[name] == null) {
                const err = `We need the constant ${name} to be defined in the posix-node module.`;
                console.warn(err);
                throw Error(err);
            }
            nativeSocktype |= posix.constants[name];
            socktype &= ~constants_1.default[name];
        }
    }
    if (socktype != 0) {
        const err = `Unable to convert remainging socktype ${socktype} to native. Make sure all SOCK* constants are defined.`;
        console.warn(err);
        throw Error(err);
    }
    return nativeSocktype;
}
exports.wasmToNativeSocktype = wasmToNativeSocktype;
function sendSockaddr(send, memory, ptr, sa_family, ai_addrlen, sa_data) {
    if (ptr == null) {
        ptr = send.malloc(2 + ai_addrlen);
    }
    const view = new DataView(memory.buffer);
    view.setUint16(ptr, sa_family, true);
    for (let i = 0; i < ai_addrlen; i++) {
        view.setUint8(ptr + 2 + i, sa_data[i]);
    }
    return ptr;
}
exports.sendSockaddr = sendSockaddr;
//# sourceMappingURL=netdb.js.map