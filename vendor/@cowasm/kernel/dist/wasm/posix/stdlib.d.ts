export default function stdlib({ child_process, os, recv, send, fs }: {
    child_process: any;
    os: any;
    recv: any;
    send: any;
    fs: any;
}): {
    setjmp: () => number;
    longjmp: () => number;
    siglongjmp: () => number;
    sigsetjmp: () => number;
    getloadavg: (loadavgDoubleArrayPtr: number, nelem: number) => number;
    system: (commandPtr: any) => number;
    realpath: (pathPtr: any, resolvedPathPtr: any) => number;
};
