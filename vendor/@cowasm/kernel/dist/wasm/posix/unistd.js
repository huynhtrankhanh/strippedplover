"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
const constants_1 = __importDefault(require("./constants"));
const debug_1 = __importDefault(require("debug"));
const wasi_js_1 = require("wasi-js");
const log = (0, debug_1.default)("posix:unistd");
function unistd(context) {
    const { fs, os, process, recv, send, wasi, posix, memory, callWithString } = context;
    // TODO: this doesn't throw an error yet if the target filesystem isn't native.
    function toNativeFd(fd) {
        // OBVIOUSLY -- these  functions won't work if the target
        // is in a wasi memfs, since the host posix libc knows nothing about that.
        // We do translate file descriptors at least.
        // Do we need to check and throw an error if target path isn't native?
        // Of course, that will happen anyways since the syscall will immediately
        // reject the invalid file descriptor anyways.
        const x = wasi.FD_MAP.get(fd);
        if (x == null) {
            throw Error("invalid file descriptor");
        }
        return x.real;
    }
    // We use the rights from stdin and stdout when making
    // a pipe.  These can get closed after startup (e.g., in
    // the test_subprocess.py cpython tests), so we have to
    // make a copy here.  This also avoids having to keep a data
    // structure in sync with wasi-js.
    const STDIN = wasi.FD_MAP.get(0);
    const STDOUT = wasi.FD_MAP.get(1);
    const unistd = {
        chown: (pathPtr, uid, gid) => {
            const path = recv.string(pathPtr);
            fs.chownSync(path, uid, gid);
            return 0;
        },
        lchown: (pathPtr, uid, gid) => {
            const path = recv.string(pathPtr);
            fs.lchownSync(path, uid, gid);
            return 0;
        },
        // int fchown(int fd, uid_t owner, gid_t group);
        _fchown: (fd, uid, gid) => {
            if (uid == 0 || gid == 0) {
                // if either is 0 = root, we just do nothing.
                // TODO: We really need to get rid of anything that involves uid/gid, which
                // just doesn't make sense for the model of WASM.
                return 0;
            }
            fs.fchownSync(toNativeFd(fd), uid, gid);
            return 0;
        },
        getuid: () => process.getuid?.() ?? 0,
        getgid: () => process.getgid?.() ?? 0,
        _geteuid: () => process.geteuid?.() ?? 0,
        getegid: () => process.getegid?.() ?? 0,
        // int getgroups(int gidsetsize, gid_t grouplist[]);
        // in WASI, "typedef unsigned gid_t"
        getgroups: (gidsetsize, grouplistPtr) => {
            const groups = process.getgroups?.();
            if (groups == null) {
                return 0; // no groups
            }
            if (gidsetsize == 0) {
                // yep, we end up computing getgroups twice, since the
                // posix api is a bit awkward...
                return groups.length;
            }
            const count = Math.min(groups.length, gidsetsize);
            if (count == 0) {
                return 0;
            }
            const view = new DataView(memory.buffer);
            for (let i = 0; i < count; i++) {
                view.setUint32(grouplistPtr + 4 * i, groups[i], true);
            }
            return count;
        },
        getpid: () => process.pid ?? 1,
        getpgid: (pid) => {
            return posix.getpgid?.(pid) ?? 1;
        },
        // int setpgid(pid_t pid, pid_t pgid);
        setpgid: (pid, pgid) => {
            if (posix.setpgid == null) {
                (0, util_1.notImplemented)("setpgid");
            }
            posix.setpgid(pid, pgid);
            return 0; // success
        },
        getpgrp: () => {
            return posix.getpgrp?.() ?? 1;
        },
        nice: (incr) => {
            const p = os.getPriority?.();
            if (p != null) {
                os.setPriority?.(p + incr);
            }
        },
        //     int getpriority(int which, id_t who);
        getpriority: (which, who) => {
            if (os.getPriority == null) {
                // environ with no info about processes (e.g., browser).
                return 0;
            }
            if (which != 0) {
                console.warn("getpriority can only be implemented in node.js for *process id*");
                return 0; // minimal info.
            }
            return os.getPriority?.(who);
        },
        //   int setpriority(int which, id_t who, int value);
        setpriority: (which, who, value) => {
            if (os.setPriority == null) {
                // environ with no info about processes (e.g., browser).
                return 0;
            }
            if (which != 0) {
                console.warn("setpriority can only be implemented in node.js for *process id*");
                return -1;
            }
            return os.setPriority?.(who, value);
        },
        // int dup(int oldfd);
        dup: (oldfd) => {
            if (posix.dup == null) {
                (0, util_1.notImplemented)("dup");
            }
            // Considered in 2022, but closed by node developers: https://github.com/libuv/libuv/issues/3448#issuecomment-1174786218
            const x = wasi.FD_MAP.get(oldfd);
            const newfd_real = posix.dup(x.real);
            const newfd = wasi.getUnusedFileDescriptor();
            wasi.FD_MAP.set(newfd, { ...x, real: newfd_real });
            return newfd;
        },
        // int dup2(int oldfd, int newfd);
        dup2: (oldfd, newfd) => {
            if (posix.dup2 == null) {
                (0, util_1.notImplemented)("dup2");
            }
            const x_old = wasi.FD_MAP.get(oldfd);
            let x_new;
            // I'm not 100% happy with this.
            if (wasi.FD_MAP.has(newfd)) {
                x_new = wasi.FD_MAP.get(newfd).real ?? newfd;
            }
            else {
                x_new = newfd;
            }
            const newfd_real = posix.dup2(x_old.real, x_new);
            wasi.FD_MAP.set(newfd, { ...x_old, real: newfd_real });
            return newfd;
        },
        sync: () => {
            // nodejs doesn't expose sync, but it does expose fsync for a file descriptor, so we call it on
            // all the open file descriptors
            if (fs.fsyncSync == null)
                return;
            for (const [_, { real }] of wasi.FD_MAP) {
                fs.fsyncSync(real);
            }
        },
        // In nodejs these set*id function can't be done in a worker thread:
        // https://nodejs.org/api/process.html#processsetgidid
        // TODO: maybe we should implement these by sending a message to
        // the main thread requesting to do them?  For now, you'll get
        // an error unless you run in a mode without a worker thread.
        setuid: () => {
            throw Error("setuid is not supported");
        },
        seteuid: (uid) => {
            if (posix.seteuid == null) {
                (0, util_1.notImplemented)("seteuid");
            }
            posix.seteuid(uid);
            return 0;
        },
        setegid: (gid) => {
            if (posix.setegid == null) {
                (0, util_1.notImplemented)("setegid");
            }
            posix.setegid(gid);
            return 0;
        },
        setgid: (gid) => {
            if (process.setgid == null) {
                (0, util_1.notImplemented)("setgid");
            }
            process.setgid(gid);
            return 0;
        },
        setsid: (sid) => {
            if (posix.setsid == null) {
                (0, util_1.notImplemented)("setsid");
            }
            return posix.setsid(sid);
        },
        // TODO!
        getsid: () => {
            (0, util_1.notImplemented)("getsid");
        },
        setreuid: (uid) => {
            if (posix.setreuid == null) {
                (0, util_1.notImplemented)("setreuid");
            }
            posix.setreuid(uid);
            return 0;
        },
        setregid: (gid) => {
            if (posix.setregid == null) {
                (0, util_1.notImplemented)("setregid");
            }
            posix.setregid(gid);
            return 0;
        },
        getppid: () => {
            if (posix.getppid == null) {
                // in browser -- only one process id:
                return unistd.getpid();
            }
            return posix.getppid();
        },
        setgroups: () => {
            (0, util_1.notImplemented)("setgroups");
        },
        setpgrp: () => {
            (0, util_1.notImplemented)("setpgrp");
        },
        tcgetpgrp: () => {
            (0, util_1.notImplemented)("tcgetpgrp");
        },
        tcsetpgrp: () => {
            (0, util_1.notImplemented)("tcsetpgrp");
        },
        // SANDBOXED: fork is disabled to prevent process creation
        fork: () => {
            (0, util_1.notImplemented)("fork blocked in sandbox");
        },
        fork1: () => {
            (0, util_1.notImplemented)("fork1");
        },
        // SANDBOXED: vfork is disabled to prevent process creation
        vfork: () => {
            (0, util_1.notImplemented)("vfork blocked in sandbox");
        },
        forkpty: () => {
            (0, util_1.notImplemented)("forkpty");
        },
        getlogin: () => {
            if (context.state.getlogin_ptr != null)
                return context.state.getlogin_ptr;
            // returns the username of the signed in user; if not available, e.g.,
            // in a browser, returns "user".
            const username = os.userInfo?.()?.username ?? "user";
            return (context.state.getlogin_ptr = send.string(username));
        },
        // int gethostname(char *name, size_t len);
        gethostname: (namePtr, len) => {
            if (os.hostname == null) {
                throw Error("gethostname not supported on this platform");
            }
            const name = os.hostname();
            send.string(name, { ptr: namePtr, len });
            return 0;
        },
        // int sethostname(const char *name, size_t len);
        sethostname: (namePtr, len) => {
            if (posix.sethostname == null) {
                throw Error("sethostname not supported on this platform");
            }
            const name = recv.string(namePtr, len);
            posix.sethostname(name);
            return 0;
        },
        // char *ttyname(int fd);
        ttyname: (fd) => {
            if (posix.ttyname == null) {
                throw Error("ttyname_r is not supported on this platform");
            }
            if (context.state.ttyname_ptr != null)
                return context.state.ttyname_ptr;
            const len = 128;
            context.state.ttyname_ptr = send.malloc(len);
            send.string(posix.ttyname(fd), { ptr: context.state.ttyname_ptr, len });
            return context.state.ttyname_ptr;
        },
        // int ttyname_r(int fd, char *buf, size_t buflen);
        ttyname_r: (fd, ptr, len) => {
            if (posix.ttyname == null) {
                throw Error("ttyname_r is not supported on this platform");
            }
            send.string(posix.ttyname(fd), { ptr, len });
            return 0;
        },
        alarm: (seconds) => {
            if (posix.alarm == null) {
                throw Error("alarm is not supported on this platform");
            }
            return posix.alarm(seconds);
        },
        // The following 4 are actually only available on a Linux host,
        // though wasi-musl defines them,
        // so cpython-wasm thinks they exist.
        // For CoWasm, let's just make these no-ops when not available,
        // since they are about multiple users, which we shouldn't
        // support in WASM.
        getresuid: (ruidPtr, euidPtr, suidPtr) => {
            let ruid, euid, suid;
            if (posix.getresuid == null) {
                ruid = euid = suid = 0;
            }
            else {
                ({ ruid, euid, suid } = posix.getresuid());
            }
            const view = new DataView(memory.buffer);
            view.setUint32(ruidPtr, ruid, true);
            view.setUint32(euidPtr, euid, true);
            view.setUint32(suidPtr, suid, true);
            return 0;
        },
        getresgid: (rgidPtr, egidPtr, sgidPtr) => {
            let rgid, egid, sgid;
            if (posix.getresgid == null) {
                rgid = egid = sgid = 0;
            }
            else {
                ({ rgid, egid, sgid } = posix.getresgid());
            }
            const view = new DataView(memory.buffer);
            view.setUint32(rgidPtr, rgid, true);
            view.setUint32(egidPtr, egid, true);
            view.setUint32(sgidPtr, sgid, true);
            return 0;
        },
        setresuid: (ruid, euid, suid) => {
            if (posix.setresuid != null) {
                posix.setresuid(ruid, euid, suid);
            }
            return 0;
        },
        setresgid: (rgid, egid, sgid) => {
            if (posix.setresgid != null) {
                posix.setresgid(rgid, egid, sgid);
            }
            return 0;
        },
        // SANDBOXED: execve is disabled to prevent arbitrary command execution
        // int execve(const char *pathname, char *const argv[], char *const envp[]);
        execve: (pathnamePtr, argvPtr, envpPtr) => {
            (0, util_1.notImplemented)("execve blocked in sandbox");
        },
        // SANDBOXED: execv is disabled to prevent arbitrary command execution
        execv: (pathnamePtr, argvPtr) => {
            (0, util_1.notImplemented)("execv blocked in sandbox");
        },
        // SANDBOXED: execvp is disabled to prevent arbitrary command execution
        // int execvp(const char *file, char *const argv[]);
        execvp: (filePtr, argvPtr) => {
            (0, util_1.notImplemented)("execvp blocked in sandbox");
        },
        // execlp is so far only by libedit to launch vim to edit
        // the history.  So it's safe to just disable.  Python doesn't
        // use this at all.
        execlp: () => {
            (0, util_1.notImplemented)("execlp");
        },
        // SANDBOXED: fexecve is disabled to prevent arbitrary command execution
        fexecve: (fd, argvPtr, envpPtr) => {
            (0, util_1.notImplemented)("fexecve blocked in sandbox");
        },
        // SANDBOXED: pipe is disabled to prevent subprocess IPC
        //  int pipe(int pipefd[2]);
        pipe: (pipefdPtr) => {
            (0, util_1.notImplemented)("pipe blocked in sandbox");
        },
        // SANDBOXED: pipe2 is disabled to prevent subprocess IPC
        pipe2: (pipefdPtr, flags) => {
            (0, util_1.notImplemented)("pipe2 blocked in sandbox");
        },
        lockf: (fd, cmd, size) => {
            const { lockf } = posix;
            if (lockf == null) {
                (0, util_1.notImplemented)("lockf");
            }
            let cmdNative = undefined;
            for (const x of ["F_ULOCK", "F_LOCK", "F_TLOCK", "F_TEST"]) {
                if (cmd == constants_1.default[x]) {
                    cmdNative = posix.constants[x];
                    break;
                }
            }
            if (cmdNative == null) {
                throw Error(`invalid cmd ${cmd}`);
            }
            lockf(toNativeFd(fd), cmdNative, BigInt(size));
            return 0;
        },
        pause: () => {
            const { pause } = posix;
            if (pause == null) {
                // this could be implemented in case of worker
                (0, util_1.notImplemented)("pause");
            }
            return pause();
        },
        // initgroups in node, so easier...
        // int initgroups(const char *user, gid_t group);
        initgroups: (userPtr, group) => {
            const { initgroups } = process;
            if (initgroups == null) {
                (0, util_1.notImplemented)("initgroups");
            }
            const user = recv.string(userPtr);
            initgroups(user, group);
            return 0;
        },
        // int getgrouplist(const char *user, gid_t group, gid_t *groups, int *ngroups);
        getgrouplist: (userPtr, group, groupPtr, ngroupsPtr) => {
            const { getgrouplist } = posix;
            const user = recv.string(userPtr);
            const ngroups = recv.i32(ngroupsPtr);
            let v;
            if (getgrouplist == null) {
                v = [group];
            }
            else {
                v = getgrouplist(user, group);
            }
            const k = Math.min(v.length, ngroups);
            for (let i = 0; i < k; i++) {
                send.u32(groupPtr + 4 * i, v[i]);
            }
            send.i32(ngroupsPtr, v.length);
            if (k < v.length) {
                return -1;
            }
            return 0;
        },
        // just like chdir, but uses a file descriptor. WASI doesn't have it, so we
        // add it.
        fchdir: (fd) => {
            const dir = wasi.FD_MAP.get(fd)?.path;
            if (!dir) {
                console.error(`fchdir: invalid file descriptor: ${fd}`);
                return -1;
            }
            return callWithString("chdir", dir);
        },
        // This is not a system call exactly.  It's used by WASI.
        // It is supposed to "Adjust the flags associated with a file descriptor."
        // and it doesn't acctually just set them because WASI doesn't
        // have a way to get.  So what we do is change the three things
        // that can be changed and leave everything else alone!
        fcntlSetFlags: (fd, flags) => {
            if (posix.fcntlSetFlags == null || posix.fcntlGetFlags == null) {
                (0, util_1.notImplemented)("fcntlSetFlags");
                return 0;
            }
            const real_fd = wasi.FD_MAP.get(fd)?.real;
            if (real_fd == null) {
                throw Error("invalid file descriptor");
            }
            let current_native_flags = posix.fcntlGetFlags(real_fd);
            let new_native_flags = current_native_flags;
            for (const name of ["O_NONBLOCK", "O_APPEND"]) {
                if (flags & constants_1.default[name]) {
                    // do want name
                    new_native_flags |= posix.constants[name];
                }
                else {
                    // do not want name
                    new_native_flags &= ~posix.constants[name];
                }
            }
            if (current_native_flags == new_native_flags) {
                log("fcntlSetFlags - unchanged");
            }
            else {
                log("fcntlSetFlags ", current_native_flags, " to", new_native_flags);
                posix.fcntlSetFlags(real_fd, new_native_flags);
            }
            return 0;
        },
    };
    return unistd;
}
exports.default = unistd;
//# sourceMappingURL=unistd.js.map