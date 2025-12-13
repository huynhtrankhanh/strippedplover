"use strict";
/*
Functions from sched.h.

These are all very hard to implement with node, without just writing a node extension
module which is what I'll likely have to do...
*/
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
function sched({}) {
    const names = "sched_get_priority_max sched_get_priority_min sched_getparam sched_getscheduler sched_rr_get_interval sched_setparam sched_setscheduler";
    const sched = {};
    for (const name of names.split(/\s+/)) {
        sched[name] = () => (0, util_1.notImplemented)(name);
    }
    return sched;
}
exports.default = sched;
//# sourceMappingURL=sched.js.map