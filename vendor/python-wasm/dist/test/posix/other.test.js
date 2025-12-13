"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("../../node");
test("test ctermid", async () => {
    const { exec, repr } = await (0, node_1.syncPython)();
    exec("import os");
    expect(typeof repr("os.ctermid()")).toBe("string");
});
test("bindtextdomain doesn't crash (it is still basically a stub)", async () => {
    const { exec, repr } = await (0, node_1.syncPython)();
    exec("import gettext");
    expect(eval(repr("gettext.bindtextdomain('foo','/bar')"))).toBe("/bar");
});
//# sourceMappingURL=other.test.js.map