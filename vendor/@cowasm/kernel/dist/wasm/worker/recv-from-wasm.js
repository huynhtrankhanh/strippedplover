"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecvFromWasmAbstractBase = void 0;
const textDecoder = new TextDecoder();
// size of a pointer in bytes
const SIZEOF_POINTER = 4;
class RecvFromWasmAbstractBase {
    // always get the view any time after a malloc may have happened!
    view() {
        return new DataView(this.memory.buffer);
    }
    // Returns the number of *bytes* in a char*.
    strlen(charPtr) {
        // TODO: benchmark the JS vs wasm implementation!
        // return this.callFunction("stringLength", charPtr);
        const mem = new Uint8Array(this.memory.buffer);
        let i = charPtr;
        while (mem[i]) {
            i += 1;
        }
        return i - charPtr;
    }
    pointer(ptr) {
        return this.view().getUint32(ptr, true);
    }
    u32(ptr) {
        return this.view().getUint32(ptr, true);
    }
    i32(ptr) {
        return this.view().getInt32(ptr, true);
    }
    pointer2(ptr) {
        return new Uint32Array(this.memory.buffer)[ptr];
    }
    // len is the number of bytes, not the number of utf-8 characters.
    string(ptr, bytes) {
        if (bytes == null) {
            // no len in bytes given, so assume it is a null terminated string.
            bytes = this.strlen(ptr);
            if (bytes == null)
                throw Error("bug");
        }
        const slice = this.memory.buffer.slice(ptr, ptr + bytes);
        return textDecoder.decode(slice);
    }
    buffer(ptr, bytes) {
        // console.log(this.memory.buffer.slice(ptr, ptr + bytes));
        // this.memory.buffer.slice makes a copy of the memory.
        return Buffer.from(this.memory.buffer.slice(ptr, ptr + bytes));
    }
    // Receive a null-terminated array of strings.
    arrayOfStrings(ptr) {
        const v = [];
        while (true) {
            const p = this.pointer(ptr);
            if (!p)
                break;
            v.push(this.string(p));
            ptr += SIZEOF_POINTER;
        }
        return v;
    }
    // Receive a null-terminated array of ints
    arrayOfI32(ptr) {
        const v = [];
        if (ptr == 0) {
            return v;
        }
        while (true) {
            const p = this.pointer(ptr);
            if (!p)
                break;
            v.push(this.i32(p));
            ptr += SIZEOF_POINTER;
        }
        return v;
    }
}
exports.RecvFromWasmAbstractBase = RecvFromWasmAbstractBase;
class RecvFromWasm extends RecvFromWasmAbstractBase {
    constructor({ memory, callFunction }) {
        super();
        this.memory = memory;
        this.callFunction = callFunction;
    }
}
exports.default = RecvFromWasm;
//# sourceMappingURL=recv-from-wasm.js.map