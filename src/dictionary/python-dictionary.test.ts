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
  });
});
