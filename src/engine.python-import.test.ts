import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StrippedPlover } from './engine.js';

const makeTmpDir = () => mkdtempSync(path.join(tmpdir(), 'py-import-'));

describe('engine python dictionary import/export', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    }
    dirs.length = 0;
  });

  it('imports and exports python dictionaries via protocol', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    const pyPath = path.join(dir, 'custom.py');
    const engine = new StrippedPlover();

    const importResponse = await engine.handleRequest({
      id: '1',
      method: 'import_dictionary',
      params: {
        path: pyPath,
        data: {
          TEFT: 'test',
          'HEL/HROE': 'hello',
        },
        merge: false,
      },
    });

    expect(importResponse.result?.entries).toBe(2);

    const exportResponse = await engine.handleRequest({
      id: '2',
      method: 'export_dictionary',
      params: { path: pyPath },
    });

    expect(exportResponse.result?.data).toEqual({
      TEFT: 'test',
      'HEL/HROE': 'hello',
    });

    const translation = await engine.handleRequest({
      id: '3',
      method: 'translate',
      params: { stroke: 'TEFT' },
    });

    expect(translation.result?.output).toEqual([{ type: 'preedit', text: 'test' }]);
  }, 60000);
});
