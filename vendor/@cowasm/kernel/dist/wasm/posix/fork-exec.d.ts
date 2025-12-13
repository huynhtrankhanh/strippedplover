export default function fork_exec({ posix, recv, wasi, run, fs, child_process, }: {
    posix: any;
    recv: any;
    wasi: any;
    run: any;
    fs: any;
    child_process: any;
}): {
    python_wasm_set_inheritable: (fd: number, inheritable: number) => number;
    python_wasm_fork_exec: (exec_array_ptr: any, argv_ptr: any, envp_ptr: any, cwd: any, p2cread: any, p2cwrite: any, c2pread: any, c2pwrite: any, errread: any, errwrite: any, errpipe_read: any, errpipe_write: any, close_fds: any, restore_signals: any, call_setsid: any, pgid_to_set: any, call_setgid: any, gid: any, call_setgroups: any, groups_size: any, groups: any, call_setuid: any, uid: any, child_umask: any, child_sigmask: any, py_fds_to_keep: any) => number;
    cowasm_vforkexec: (argvPtr: number, pathPtr?: number) => number;
};
