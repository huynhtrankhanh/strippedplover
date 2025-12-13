"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("../node");
test("that the default syncPython import works", async () => {
    const { exec, repr } = await (0, node_1.syncPython)();
    exec("a = 2+3");
    expect(repr("a")).toBe("5");
});
test("that the default asyncPython import works", async () => {
    const { exec, repr, kernel } = await (0, node_1.asyncPython)();
    await exec("a = 2+3");
    expect(await repr("a")).toBe("5");
    await kernel.terminate();
});
//# sourceMappingURL=default.test.js.map