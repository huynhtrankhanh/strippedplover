export default function socket({ callFunction, posix, recv, wasi, send, memory, }: {
    callFunction: any;
    posix: any;
    recv: any;
    wasi: any;
    send: any;
    memory: any;
}): {
    socket(family: number, socktype: number, protocol: number): number;
    bind(socket: number, sockaddrPtr: number, address_len: number): number;
    connect(socket: number, sockaddrPtr: number, address_len: number): number;
    getsockname(socket: number, sockaddrPtr: number, addressLenPtr: number): number;
    getpeername(socket: number, sockaddrPtr: number, addressLenPtr: number): number;
    recv(socket: number, bufPtr: number, length: number, flags: number): number;
    recvfrom(socket: number, bufPtr: number, length: number, flags: number, sockaddrPtr: number, sockaddrLenPtr: number): number;
    send(socket: number, bufPtr: number, length: number, flags: number): number;
    sendto(socket: number, bufPtr: number, length: number, flags: number, addressPtr: number, addressLen: number): number;
    shutdown(socket: number, how: number): number;
    listen(socket: number, backlog: number): number;
    accept(socket: number, sockaddrPtr: number, socklenPtr: number): number;
    getsockopt(socket: number, level: number, option_name: number, option_value_ptr: number, option_len_ptr: number): number;
    setsockopt(socket: number, level: number, option_name: number, option_value_ptr: number, option_len: number): number;
    pollSocket(socket: number, type: "read" | "write", timeout_ms: number): number;
};
