interface Parent {
    on: Function;
    postMessage: Function;
}
export default function initWorker({ wasmImport, parent, captureOutput, IOHandler, }: {
    wasmImport: Function;
    parent: Parent;
    captureOutput?: boolean;
    IOHandler: any;
}): void;
export {};
