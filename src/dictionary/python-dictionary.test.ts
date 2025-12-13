import { describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('node:sqlite', () => {
  class Statement {
    get() {
      return { count: 0 };
    }
    all() {
      return [];
    }
    run() {
      return { changes: 0 };
    }
  }
  class FakeDatabase {
    exec(): void {}
    prepare(): Statement {
      return new Statement();
    }
    close(): void {}
  }
  return { DatabaseSync: FakeDatabase };
});

vi.mock('../../vendor/python-wasm/dist/node.js', () => {
  const state = {
    longestKey: 0,
    entries: new Map<string, string>(),
  };

  function parsePythonDict(code: string) {
    const lk = code.match(/LONGEST_KEY\s*=\s*(\d+)/);
    if (lk) {
      state.longestKey = Number.parseInt(lk[1], 10);
    }
    const entriesMatch = code.match(/ENTRIES\s*=\s*\{([^}]*)\}/s);
    if (entriesMatch) {
      const body = entriesMatch[1];
      const pairRe = /\(\s*'([^']+)'\s*,?\s*\)\s*:\s*'([^']+)'/g;
      let m: RegExpExecArray | null;
      while ((m = pairRe.exec(body)) !== null) {
        state.entries.set(m[1], m[2]);
      }
    }
  }

  const stub = {
    async exec(code: string) {
      if (code.includes('LONGEST_KEY') && code.includes('ENTRIES')) {
        parsePythonDict(code);
        return '';
      }
      return '';
    },
    async repr(expr: string) {
      if (expr.includes('int(LONGEST_KEY')) {
        return String(state.longestKey);
      }
      if (expr.includes('__sp_collect_entries')) {
        const arr: Array<[string[], string]> = [];
        for (const [k, v] of state.entries.entries()) {
          arr.push([[k], v]);
        }
        return JSON.stringify(arr);
      }
      return '';
    },
  };

  return {
    __esModule: true,
    async asyncPython() {
      return stub;
    },
  };
});

import { loadDictionary } from './loader.js';

describe('python dictionary loader (wasm sandbox)', () => {
  it('loads entries and enforces read-only operations', async () => {
    const dir = tmpdir();
    const file = path.join(dir, `dict-${Date.now()}.py`);
    writeFileSync(
      file,
      [
        'LONGEST_KEY = 1',
        "ENTRIES = {('TEFT',): 'test'}",
      ].join('\n'),
      'utf-8'
    );

    const dict = await loadDictionary(file);
    expect(dict.length).toBe(1);
    expect(dict.get(['TEFT'])).toBe('test');
    expect(dict.longestKey).toBe(1);
    expect(() => dict.set(['A'], 'b')).toThrow();
    expect(() => dict.delete(['A'])).toThrow();
  }, 15000);
});
