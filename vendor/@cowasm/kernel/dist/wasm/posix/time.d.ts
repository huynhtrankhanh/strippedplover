export default function time({ child_process, memory, os }: {
    child_process: any;
    memory: any;
    os: any;
}): {
    adjtime(): void;
    settimeofday(): void;
    clock_settime(_clk_id: number, timespec: number): number;
};
