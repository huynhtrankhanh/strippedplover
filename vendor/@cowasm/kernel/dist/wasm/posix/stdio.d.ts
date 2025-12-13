export default function stdio(context: any): {
    tmpnam(sPtr: number): number;
    popen(_commandPtr: number, _typePtr: number): number;
    pclose(_streamPtr: number): number;
};
