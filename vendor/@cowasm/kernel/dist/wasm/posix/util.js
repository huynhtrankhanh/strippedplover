"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notImplemented = exports.NotImplementedError = void 0;
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("posix");
class NotImplementedError extends Error {
    constructor(functionName, ret) {
        super(`${functionName} is not implemented yet`);
        this.name = "NotImplementedError"; // name is a standard exception property.
        if (ret != null) {
            this.ret = ret;
        }
    }
}
exports.NotImplementedError = NotImplementedError;
function notImplemented(functionName, ret = -1) {
    console.warn("WARNING: calling NOT IMPLEMENTED function", functionName);
    log("WARNING: calling NOT IMPLEMENTED function", functionName);
    throw new NotImplementedError(functionName, ret);
}
exports.notImplemented = notImplemented;
//# sourceMappingURL=util.js.map