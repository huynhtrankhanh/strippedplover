export declare function getSignalSet(setPtr: number): Set<number>;
export declare function setSignalSet(setPtr: number, value: Set<number>): void;
export default function signal({ process }: {
    process: any;
}): {
    kill: (pid: number, signal: number) => number;
    raise: (sig: number) => number;
    killpg: (pid: number, signal: number) => number;
    sigemptyset: (setPtr: number) => number;
    sigfillset: (setPtr: number) => number;
    sigaddset: (setPtr: number, signum: number) => number;
    sigdelset: (setPtr: number, signum: number) => number;
    sigismember: (setPtr: number, signum: number) => number;
    sigprocmask: (how: number, setPtr: number, oldsetPtr: number) => number;
    sigsuspend: () => void;
};
