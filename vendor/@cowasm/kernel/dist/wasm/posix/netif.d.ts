export default function netif({ posix, recv, send, callFunction }: {
    posix: any;
    recv: any;
    send: any;
    callFunction: any;
}): {
    if_indextoname: (ifindex: number, ifnamePtr: number) => number;
    if_nametoindex: (ifnamePtr: number) => number;
    if_nameindex: () => number;
    if_freenameindex: (ptr: any) => void;
};
