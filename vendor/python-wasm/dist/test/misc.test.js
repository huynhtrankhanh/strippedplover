"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("../node");
test("that creating a directory works, and can get listing on new directory", async () => {
    const { exec, repr } = await (0, node_1.syncPython)();
    const path = `/tmp/${Math.random()}`;
    try {
        exec(`import os; os.makedirs('${path}')`);
        expect(repr(`os.path.exists('${path}')`)).toBe("True");
        expect(repr(`os.listdir('${path}')`)).toBe("[]");
    }
    finally {
        exec(`os.rmdir('${path}')`);
    }
});
//# sourceMappingURL=misc.test.js.map