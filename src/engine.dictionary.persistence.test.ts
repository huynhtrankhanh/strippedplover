import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StrippedPlover } from './engine.js';

describe('dictionary persistence and lookup', () => {
  function makeDbPath(): string {
    return join(mkdtempSync(join(tmpdir(), 'strippedplover-test-')), 'lmdb');
  }

  it('persists imported JSON dictionaries across engine instances', async () => {
    const dbPath = makeDbPath();
    const engine1 = new StrippedPlover(dbPath);

    await engine1.handleRequest({
      id: '1',
      method: 'import_dictionary',
      params: {
        name: 'persist-json',
        type: 'json',
        data: { TEFT: 'test' },
      },
    });

    const engine2 = new StrippedPlover(dbPath);
    const lookup = await engine2.handleRequest({
      id: '2',
      method: 'lookup',
      params: { stroke: 'TEFT' },
    });

    expect(lookup.result?.translation).toBe('test');
  });

  it('waits for dictionaries to load before serving lookups', async () => {
    const dbPath = makeDbPath();
    const engine = new StrippedPlover(dbPath);

    await engine.handleRequest({
      id: '1',
      method: 'import_dictionary',
      params: {
        name: 'race-json',
        type: 'json',
        data: { KAT: 'cat' },
      },
    });

    const lookup = await engine.handleRequest({
      id: '2',
      method: 'lookup',
      params: { stroke: 'KAT' },
    });

    expect(lookup.result?.translation).toBe('cat');
  });
});
