export default function wait({ posix, send }: {
    posix: any;
    send: any;
}): {
    wait: (wstatusPtr: number) => number;
    waitid: () => number;
    waitpid: (pid: number, wstatusPtr: number, options: number) => number;
    wait3: (wstatusPtr: number, options: number, rusagePtr: number) => number;
};
