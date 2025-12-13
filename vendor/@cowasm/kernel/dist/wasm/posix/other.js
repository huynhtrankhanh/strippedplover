"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
function other(context) {
    const { callFunction, posix, recv, send, wasi } = context;
    context.state.user_from_uid_cache = {};
    function sendStatvfs(bufPtr, x) {
        callFunction("set_statvfs", bufPtr, x.f_bsize, x.f_frsize, BigInt(x.f_blocks), BigInt(x.f_bfree), BigInt(x.f_bavail), BigInt(x.f_files), BigInt(x.f_ffree), BigInt(x.f_favail), x.f_fsid, x.f_flag, x.f_namemax);
    }
    function real_fd(virtual_fd) {
        const data = wasi.FD_MAP.get(virtual_fd);
        if (data == null) {
            return -1;
        }
        return data.real;
    }
    const lib = {
        syslog: () => {
            (0, util_1.notImplemented)("syslog");
        },
        login_tty: (fd) => {
            if (posix.login_tty == null) {
                (0, util_1.notImplemented)("login_tty");
            }
            posix.login_tty(real_fd(fd));
            return 0;
        },
        // TODO: worry about virtual filesystem that WASI provides,
        // versus this just being the straight real one?!
        // int statvfs(const char *restrict path, struct statvfs *restrict buf);
        statvfs: (pathPtr, bufPtr) => {
            if (posix.statvfs == null) {
                (0, util_1.notImplemented)("statvfs");
            }
            const path = recv.string(pathPtr);
            sendStatvfs(bufPtr, posix.statvfs(path));
            return 0;
        },
        //       int fstatvfs(int fd, struct statvfs *buf);
        fstatvfs: (fd, bufPtr) => {
            if (posix.fstatvfs == null) {
                (0, util_1.notImplemented)("fstatvfs");
            }
            sendStatvfs(bufPtr, posix.fstatvfs(real_fd(fd)));
            return 0;
        },
        ctermid: (ptr) => {
            if (posix.ctermid == null) {
                (0, util_1.notImplemented)("ctermid");
            }
            if (ptr) {
                const s = posix.ctermid();
                send.string(s, { ptr, len: s.length + 1 });
                return ptr;
            }
            if (context.state.ctermidPtr) {
                return context.state.ctermidPtr;
            }
            const s = posix.ctermid();
            return (context.state.ctermidPtr = send.string(s));
        },
        // password stuff
        // int getpwnam_r(const char *name, struct passwd *pwd, char *buffer, size_t bufsize, struct passwd **result);
        getpwnam_r: (_namePtr, _passwdPtr, _bufferPtr, _bufsize, result_ptr_ptr) => {
            // this means "not found".
            send.pointer(result_ptr_ptr, 0);
            return 0;
        },
        // struct passwd *getpwuid(uid_t uid);
        getpwuid: () => {
            // not found
            return 0;
        },
        // int getpwuid_r(uid_t uid, struct passwd *pwd, char *buffer,
        // size_t bufsize, struct passwd **result);
        getpwuid_r: (_uid, _passwdPtr, _bufferPtr, _bufsize, result_ptr_ptr) => {
            send.pointer(result_ptr_ptr, 0);
            return 0;
        },
        openpty: () => {
            // TOOD: plan to do this inspired by https://github.com/microsoft/node-pty, either
            // using that or just a little inspired by it to add to posix-node.
            (0, util_1.notImplemented)("openpty");
        },
        msync: () => {
            // This is part of mmap.
            (0, util_1.notImplemented)("msync");
        },
        madvise: () => {
            (0, util_1.notImplemented)("madvise");
        },
        mremap: () => {
            (0, util_1.notImplemented)("mremap");
        },
        // The curses cpython module wants this:
        // FILE *tmpfile(void);
        /* ~/test/tmpfile$ more a.c
        #include<stdio.h>
        int main() {
           FILE* f = tmpfile();
           printf("f = %p\n", f);
        }
        ~/test/tmpfile$ zig cc -target wasm32-wasi ./a.c
        ./a.c:3:14: warning: 'tmpfile' is deprecated: tmpfile is not defined on WASI [-Wdeprecated-declarations]
        */
        tmpfile: () => {
            (0, util_1.notImplemented)("tmpfile");
        },
        openlog: () => {
            (0, util_1.notImplemented)("openlog");
        },
        // curses also wants this:
        // int tcflush(int fildes, int action);
        tcflush: () => {
            (0, util_1.notImplemented)("tcflush");
        },
        // struct passwd *getpwnam(const char *login);
        getpwnam: () => {
            console.log("STUB: getpwnam");
            // return 0 indicates failure
            return 0;
        },
        // int getrlimit(int resource, struct rlimit *rlp);
        getrlimit: () => {
            (0, util_1.notImplemented)("getrlimit");
        },
        //  int setrlimit(int resource, const struct rlimit *rlp);
        setrlimit: () => {
            (0, util_1.notImplemented)("setrlimit");
        },
        // numpy wants this thing that can't exist in wasm:
        // int backtrace(void** array, int size);
        // Commenting this out and instead patching numpy to not try to use this, since we
        // have to do that anyways to get it to build with clang15.
        //     backtrace: () => {
        //       notImplemented("backgrace");
        //     },
        // These are for coreutils, and we come up with a WebAssembly version,
        // which is the documented fallback.
        //     char * user_from_uid(uid_t uid, int nouser);
        //     char * group_from_gid(gid_t gid, int nogroup);
        // TODO: for speed this would be better at the C level.
        user_from_uid: (uid, nouser = 0) => {
            if (nouser) {
                return 0;
            }
            // cache the pointers for speed and to reduce memory leaks
            if (context.state.user_from_uid_cache[uid]) {
                return context.state.user_from_uid_cache[uid];
            }
            return (context.state.user_from_uid_cache[uid] = send.string(`${uid}`));
        },
        group_from_gid: (gid, nogroup = 0) => {
            return lib.user_from_uid(gid, nogroup);
        },
        // TODO -- see how this is used in code, or maybe make it
        // do something like "#define getrusage(A,B) memset(B,0,sizeof(*B))"
        // to make everything 0, as a stub.
        //  int getrusage(int who, struct rusage *r_usage);
        getrusage: (_who, _r_usage_ptr) => {
            (0, util_1.notImplemented)("getrusage");
            return 0;
        },
        // C++ stuff we don't support:
        _Znwm: () => {
            // operator new
            (0, util_1.notImplemented)("_Znwm");
        },
        _ZdlPv: () => {
            // operator delete
            (0, util_1.notImplemented)("_ZdlPv");
        },
        __cxa_throw: () => {
            (0, util_1.notImplemented)("__cxa_throw");
        },
        // exception
        __cxa_allocate_exception: () => {
            (0, util_1.notImplemented)("__cxa_allocate_exception");
        },
        _ZNSt20bad_array_new_lengthC1Ev: () => {
            (0, util_1.notImplemented)("_ZNSt20bad_array_new_lengthC1Ev");
        },
        _ZNSt20bad_array_new_lengthD1Ev: () => {
            (0, util_1.notImplemented)("_ZNSt20bad_array_new_lengthD1Ev");
        },
        _ZTISt20bad_array_new_length: () => {
            (0, util_1.notImplemented)("_ZTISt20bad_array_new_length");
        },
        ngettext: () => {
            (0, util_1.notImplemented)("ngettext");
        },
        dngettext: () => {
            (0, util_1.notImplemented)("dngettext");
        },
        dcngettext: () => {
            (0, util_1.notImplemented)("dcngettext");
        },
    };
    return lib;
}
exports.default = other;
//# sourceMappingURL=other.js.map