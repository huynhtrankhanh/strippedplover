"use strict";
/*
NOTES:
A key fact is that zig defines sigset_t to be "unsigned char", instead of a much
more useful larger struct. Thus we only have 8 bits, so can't really represent
all the signals.  So instead we just use the pointer and a higher level Javascript
Set data structure.  Since any nontrivial signal functionality has to be at the
Javascript level anyways, this is probably just fine.

They say this in the zig sources, and just worrying about the pointer makes things
agnostic.

// TODO: This is just a placeholder for now. Keep this in sync with musl.
typedef unsigned char sigset_t;

NOTE: below we implement more than just what's needed for Python.  This may be helpful
for other libraries.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSignalSet = exports.getSignalSet = void 0;
const constants_1 = __importDefault(require("./constants"));
const util_1 = require("./util");
const signal_t = {};
function getSignalSet(setPtr) {
    if (signal_t[setPtr] == null) {
        signal_t[setPtr] = new Set();
    }
    return signal_t[setPtr];
}
exports.getSignalSet = getSignalSet;
function setSignalSet(setPtr, value) {
    signal_t[setPtr] = value;
}
exports.setSignalSet = setSignalSet;
// The global signal mask for this process.
const signalMask = new Set();
function setSignalSetToMask(setPtr) {
    const set = getSignalSet(setPtr);
    set.clear();
    for (const x of signalMask) {
        set.add(x);
    }
}
function signal({ process }) {
    const signal = {
        // int kill(pid_t pid, int sig);
        kill: (pid, signal) => {
            if (process.kill == null)
                return 0;
            process.kill(pid, signal);
            return 0;
        },
        // NOTE: this is the single threaded version!
        // int raise(int sig);
        // according to man is same as "kill(getpid(), sig);" for single thread.
        raise: (sig) => {
            return signal.kill(process.pid ?? 1, sig);
        },
        // int killpg(int pgrp, int sig);
        killpg: (pid, signal) => {
            if (process.kill == null)
                return 0;
            process.kill(-pid, signal);
            return 0;
        },
        // int sigemptyset(sigset_t *set);
        sigemptyset: (setPtr) => {
            getSignalSet(setPtr).clear();
            return 0;
        },
        // int sigfillset(sigset_t *set);
        sigfillset: (setPtr) => {
            const set = getSignalSet(setPtr);
            for (let sig = 1; sig <= 31; sig++) {
                set.add(sig);
            }
            return 0;
        },
        // int sigfillset(sigset_t *set);
        // int sigaddset(sigset_t *set, int signum);
        sigaddset: (setPtr, signum) => {
            getSignalSet(setPtr).add(signum);
            return 0;
        },
        // int sigdelset(sigset_t *set, int signum);
        sigdelset: (setPtr, signum) => {
            getSignalSet(setPtr).delete(signum);
            return 0;
        },
        // int sigismember(const sigset_t *set, int signum);
        sigismember: (setPtr, signum) => {
            if (getSignalSet(setPtr).has(signum)) {
                return 1;
            }
            else {
                return 0;
            }
        },
        // int sigprocmask(int how, const sigset_t *set, sigset_t *oldset);
        // "sigprocmask() is used to fetch and/or change the signal mask of
        // the calling thread.  The signal mask is the set of signals whose
        // delivery is currently blocked for the caller."
        sigprocmask: (how, setPtr, oldsetPtr) => {
            try {
                if (!setPtr)
                    return 0;
                const set = getSignalSet(setPtr);
                switch (how) {
                    case constants_1.default.SIG_BLOCK:
                        for (const s of set) {
                            signalMask.add(s);
                        }
                        return 0;
                    case constants_1.default.SIG_UNBLOCK:
                        for (const s of set) {
                            signalMask.delete(s);
                        }
                        return 0;
                    case constants_1.default.SIG_SETMASK:
                        signalMask.clear();
                        for (const s of set) {
                            signalMask.add(s);
                        }
                        return 0;
                    default:
                        throw Error(`sigprocmask - invalid how=${how}`);
                }
            }
            finally {
                if (oldsetPtr) {
                    setSignalSetToMask(oldsetPtr);
                }
            }
        },
        // int sigsuspend(const sigset_t *sigmask);
        sigsuspend: () => {
            (0, util_1.notImplemented)("sigsuspend");
        },
    };
    // for single threaded programs, these are the same:
    // @ts-ignore
    signal.pthread_sigmask = signal.sigprocmask;
    return signal;
}
exports.default = signal;
//# sourceMappingURL=signal.js.map