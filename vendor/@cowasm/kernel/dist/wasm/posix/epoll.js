"use strict";
/*

See https://en.wikipedia.org/wiki/Epoll

This is a stub implementation of epoll that doesn't do anything in terms
of actually detecting file changes, but also appears not broken to the user.
It's very reasonable that we could implement a real version of epoll.
For linux it could just be a lightweight wrapper around real epoll, and for
other environments, something else depending on constraints.

This is used by the tail coreutils command to watch a file...
*/
Object.defineProperty(exports, "__esModule", { value: true });
function epoll({ sleep }) {
    return {
        // int epoll_create(int flags);
        epoll_create: (_size) => {
            return 0;
        },
        // int epoll_create1(int flags);
        epoll_create1: (_flags) => {
            return 0;
        },
        // int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
        epoll_ctl: (_epfd, _op, _fd, _epoll_event_ptr) => {
            return 0;
        },
        // int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
        epoll_wait: (_epfd, _epoll_event_ptr, _maxevents, timeout) => {
            // if blocking sleep is available, we wait timeout *milliseconds*, then return 0
            sleep?.(timeout);
            return 0;
        },
    };
}
exports.default = epoll;
//# sourceMappingURL=epoll.js.map