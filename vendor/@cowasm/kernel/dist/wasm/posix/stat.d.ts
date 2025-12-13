export default function stats({ fs, process, recv, wasi }: {
    fs: any;
    process: any;
    recv: any;
    wasi: any;
}): {
    chmod: (pathPtr: number, mode: number) => -1 | 0;
    _fchmod: (fd: number, mode: number) => number;
    fchmodat: (dirfd: number, pathPtr: number, mode: number, _flags: number) => number;
    lchmod: (pathPtr: number, mode: number) => -1 | 0;
    umask: (mask: number) => any;
    mkfifo: () => void;
    mknod: () => void;
};
