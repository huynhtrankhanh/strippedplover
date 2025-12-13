"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* Python Trampoline Calls */
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("python-wasm-trampoline");
function initPythonTrampolineCalls(table, env) {
    env["_PyImport_InitFunc_TrampolineCall"] = (ptr) => {
        const r = table.get(ptr)();
        log("_PyImport_InitFunc_TrampolineCall - ptr=", ptr, " r=", r);
        return r;
    };
    env["_PyCFunctionWithKeywords_TrampolineCall"] = (ptr, self, args, kwds) => {
        // log("_PyCFunctionWithKeywords_TrampolineCall - ptr=", ptr);
        return table.get(ptr)(self, args, kwds);
    };
    env["descr_set_trampoline_call"] = (set, obj, value, closure) => {
        // log("descr_set_trampoline_call");
        return table.get(set)(obj, value, closure);
    };
    env["descr_get_trampoline_call"] = (get, obj, closure) => {
        // log("descr_get_trampoline_call");
        return table.get(get)(obj, closure);
    };
}
exports.default = initPythonTrampolineCalls;
//# sourceMappingURL=trampoline.js.map