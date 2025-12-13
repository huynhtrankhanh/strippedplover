export default function netdb({ memory, posix, callFunction, recv, send, free, }: {
    memory: any;
    posix: any;
    callFunction: any;
    recv: any;
    send: any;
    free: any;
}): any;
export declare function wasmToNativeFamily(posix: any, family: number): number;
export declare function nativeToWasmFamily(posix: any, family: number): number;
export declare function wasmToNativeSocktype(posix: any, socktype: number): number;
export declare function sendSockaddr(send: any, memory: any, ptr: any, sa_family: any, ai_addrlen: any, sa_data: any): number;
