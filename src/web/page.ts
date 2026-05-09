import { ProtocolRequest, ProtocolResponse, StrippedPlover } from '../engine.js';

type BridgeResult = {
  response: ProtocolResponse;
  events: Array<Record<string, unknown>>;
  quit: boolean;
};

declare global {
  interface Window {
    StrippedPloverBridge: {
      init: (databaseName: string) => Promise<{ status: 'ready' }>;
      handleRequest: (request: ProtocolRequest) => Promise<BridgeResult>;
      handleRawRequest: (rawLine: string) => Promise<BridgeResult>;
    };
  }
}

let engine: StrippedPlover | null = null;
let initializedName: string | null = null;
const eventQueue: Array<Record<string, unknown>> = [];

async function init(databaseName: string): Promise<{ status: 'ready' }> {
  const name = databaseName || 'default';
  if (!engine || initializedName !== name) {
    engine = new StrippedPlover(name);
    engine.setEventSink(event => {
      eventQueue.push(event);
    });
    initializedName = name;
  }
  return { status: 'ready' };
}

function drainEvents(): Array<Record<string, unknown>> {
  if (eventQueue.length === 0) {
    return [];
  }
  return eventQueue.splice(0, eventQueue.length);
}

async function handleRequest(request: ProtocolRequest): Promise<BridgeResult> {
  if (!engine) {
    await init('default');
  }

  const responseWithMeta = await (engine as StrippedPlover).handleRequest(request);
  const quit = Boolean((responseWithMeta as { quit?: boolean }).quit);
  delete (responseWithMeta as { quit?: boolean }).quit;

  return {
    response: responseWithMeta,
    events: drainEvents(),
    quit,
  };
}

async function handleRawRequest(rawLine: string): Promise<BridgeResult> {
  const trimmedLine = rawLine.trim();

  if (!trimmedLine) {
    return {
      response: { id: null, result: { status: 'ok' } },
      events: drainEvents(),
      quit: false,
    };
  }

  try {
    const parsed = JSON.parse(trimmedLine) as ProtocolRequest;
    return await handleRequest(parsed);
  } catch (e) {
    return {
      response: {
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
        },
      },
      events: drainEvents(),
      quit: false,
    };
  }
}

window.StrippedPloverBridge = {
  init,
  handleRequest,
  handleRawRequest,
};
