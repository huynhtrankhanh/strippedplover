"use strict";
/*
SANDBOXED VERSION: All network interface operations are disabled to reduce attack surface.
Functions from net/if.h - now all operations throw not implemented errors.
*/
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
function netif(_context) {
    // All network interface operations are blocked in sandbox mode
    return {
        if_indextoname: () => {
            (0, util_1.notImplemented)("network operations blocked in sandbox");
            return 0;
        },
        if_nametoindex: () => {
            (0, util_1.notImplemented)("network operations blocked in sandbox");
            return 0;
        },
        if_nameindex: () => {
            (0, util_1.notImplemented)("network operations blocked in sandbox");
            return 0;
        },
        if_freenameindex: () => {
            // no-op
        },
    };
}
exports.default = netif;
//# sourceMappingURL=netif.js.map