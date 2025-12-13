"use strict";
/*
SANDBOXED VERSION: All socket operations are disabled to reduce attack surface.
This is an implementation of POSIX Sockets - now all operations throw ENOTSUP.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const errno_1 = __importDefault(require("./errno"));
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("posix:socket:sandboxed");
function socket(_context) {
    // All socket operations are disabled in sandbox mode
    const blocked = () => {
        log("socket operation blocked in sandbox mode");
        throw (0, errno_1.default)("ENOTSUP");
    };
    return {
        socket: blocked,
        bind: blocked,
        connect: blocked,
        getsockname: blocked,
        getpeername: blocked,
        recv: blocked,
        recvfrom: blocked,
        send: blocked,
        sendto: blocked,
        shutdown: blocked,
        listen: blocked,
        accept: blocked,
        getsockopt: blocked,
        setsockopt: blocked,
        pollSocket: () => 0,
    };
}
exports.default = socket;
//# sourceMappingURL=socket.js.map