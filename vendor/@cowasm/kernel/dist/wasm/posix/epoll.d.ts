export default function epoll({ sleep }: {
    sleep?: any;
}): {
    epoll_create: (_size: number) => number;
    epoll_create1: (_flags: number) => number;
    epoll_ctl: (_epfd: number, _op: number, _fd: number, _epoll_event_ptr: number) => number;
    epoll_wait: (_epfd: number, _epoll_event_ptr: number, _maxevents: number, timeout: number) => number;
};
