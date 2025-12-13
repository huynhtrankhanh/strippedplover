export default function termios({ posix, recv, send, wasi, noStdio }: {
    posix: any;
    recv: any;
    send: any;
    wasi: any;
    noStdio: any;
}): {
    tcgetattr(wasi_fd: number, tioPtr: number): number;
    tcsetattr(wasi_fd: number, _optional_actions: number, tioPtr: number): number;
    tcdrain(): number;
    tcflow(): number;
    tcflush(): number;
    tcsendbreak(): number;
};
