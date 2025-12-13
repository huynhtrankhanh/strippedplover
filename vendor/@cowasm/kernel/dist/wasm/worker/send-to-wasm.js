"use strict";
/*
Functions for sending objects from Javascript to WASM.
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendToWasmAbstractBase = void 0;
const encoder = new TextEncoder();
class SendToWasmAbstractBase {
    // malloc is public in Send since it's "sending random bytes".
    malloc(bytes) {
        const ptr = this.callFunction("c_malloc", bytes);
        if (!ptr) {
            throw Error("Out of Memory");
        }
        return ptr;
    }
    free(ptr) {
        this.callFunction("c_free", ptr);
    }
    // always get the view any time after a malloc may have happened!
    view() {
        return new DataView(this.memory.buffer);
    }
    pointer(address, ptr) {
        this.view().setUint32(address, ptr, true); // true = little endian!!
    }
    i32(ptr, value) {
        this.view().setInt32(ptr, value, true);
    }
    f64(ptr, value) {
        this.view().setFloat64(ptr, value, true);
    }
    f32(ptr, value) {
        this.view().setFloat32(ptr, value, true);
    }
    u32(ptr, value) {
        this.view().setUint32(ptr, value, true);
    }
    // WARNING: this returns a pointer to memory that
    // was malloced.  Depending on your use, you might
    // want to free it.
    // If dest is given, that's a pointer to where to copy
    // the string (null terminated), with a bound of len bytes
    // including a terminating null byte.
    // Caller is responsible for freeing the returned char* from stringToU8
    // using this.exports.c_free, e.g., as done in callWithString here.
    // If dest and len are given, string is copied into memory starting
    // at dest instead, but truncated to len (including the null byte).
    string(str, dest) {
        return this.encodedString(encoder.encode(str), dest);
    }
    // same as string above, but input is already encoded.
    encodedString(strAsArray, dest) {
        if (dest != null) {
            if (!dest.len) {
                console.warn("send-to-wasm: encodedString -- suspicious dest.len = 0!");
            }
            strAsArray = strAsArray.slice(0, dest.len - 1); // ensure it will fit
        }
        const len = strAsArray.length + 1;
        const ptr = dest?.ptr ?? this.malloc(len);
        const array = new Int8Array(this.memory.buffer, ptr, len);
        array.set(strAsArray);
        array[len - 1] = 0;
        return ptr;
    }
    // This is null terminated, i.e., it's  "*char[]", where the last char[] is 0,
    // which is what a lot of posix functions want.
    arrayOfStrings(v) {
        const ptr = this.malloc(4 * (v.length + 1));
        for (let i = 0; i < v.length; i++) {
            const sPtr = this.string(v[i]);
            this.pointer(ptr + 4 * i, sPtr);
        }
        this.pointer(ptr + 4 * v.length, 0);
        return ptr;
    }
    buffer(buf, ptr) {
        if (ptr == null) {
            ptr = this.malloc(buf.byteLength);
        }
        const array = new Uint8Array(this.memory.buffer);
        buf.copy(array, ptr);
        return ptr;
    }
}
exports.SendToWasmAbstractBase = SendToWasmAbstractBase;
class SendToWasm extends SendToWasmAbstractBase {
    constructor({ memory, callFunction }) {
        super();
        this.memory = memory;
        this.callFunction = callFunction;
    }
}
exports.default = SendToWasm;
//# sourceMappingURL=send-to-wasm.js.map