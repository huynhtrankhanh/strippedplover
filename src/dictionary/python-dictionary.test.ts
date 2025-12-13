import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
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

// Track separate state per asyncPython instance to properly test statefulness
let instanceCounter = 0;
const instanceStates = new Map<number, { longestKey: number; entries: Map<string, string> }>();

vi.mock('../../vendor/python-wasm/dist/node.js', () => {
  function parsePythonDict(code: string, state: { longestKey: number; entries: Map<string, string> }) {
    const lk = code.match(/LONGEST_KEY\s*=\s*(\d+)/);
    if (lk) {
      state.longestKey = Number.parseInt(lk[1], 10);
    }
    // Parse single-stroke entries like ('TEFT',): 'test'
    const singleStrokeRe = /\(\s*'([^']+)'\s*,?\s*\)\s*:\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = singleStrokeRe.exec(code)) !== null) {
      state.entries.set(m[1], m[2]);
    }
    // Parse multi-stroke entries like ('TEFT', 'TEFT'): 'test test'
    const multiStrokeRe = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)\s*:\s*'([^']+)'/g;
    while ((m = multiStrokeRe.exec(code)) !== null) {
      state.entries.set(`${m[1]}/${m[2]}`, m[3]);
    }
    // Parse triple-stroke entries
    const tripleStrokeRe = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)\s*:\s*'([^']+)'/g;
    while ((m = tripleStrokeRe.exec(code)) !== null) {
      state.entries.set(`${m[1]}/${m[2]}/${m[3]}`, m[4]);
    }
  }

  return {
    __esModule: true,
    async asyncPython() {
      // Create fresh state for each Python instance
      const instanceId = instanceCounter++;
      const state = { longestKey: 0, entries: new Map<string, string>() };
      instanceStates.set(instanceId, state);

      return {
        async exec(code: string) {
          if (code.includes('LONGEST_KEY') || code.includes('ENTRIES')) {
            parsePythonDict(code, state);
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
              arr.push([k.split('/'), v]);
            }
            return JSON.stringify(arr);
          }
          return '';
        },
      };
    },
  };
});

import { loadDictionary } from './loader.js';

describe('python dictionary loader (wasm sandbox)', () => {
  const tempFiles: string[] = [];

  beforeEach(() => {
    // Reset instance counter for clean state tracking
    instanceCounter = 0;
    instanceStates.clear();
  });

  // Clean up temp files after tests
  afterAll(() => {
    for (const file of tempFiles) {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  function createTempPythonDict(content: string): string {
    const dir = tmpdir();
    const file = path.join(dir, `dict-${Date.now()}-${Math.random().toString(36).slice(2)}.py`);
    writeFileSync(file, content, 'utf-8');
    tempFiles.push(file);
    return file;
  }

  it('loads entries and enforces read-only operations', async () => {
    const file = createTempPythonDict([
      'LONGEST_KEY = 1',
      "ENTRIES = {('TEFT',): 'test'}",
    ].join('\n'));

    const dict = await loadDictionary(file);
    expect(dict.length).toBe(1);
    expect(dict.get(['TEFT'])).toBe('test');
    expect(dict.longestKey).toBe(1);
    expect(() => dict.set(['A'], 'b')).toThrow();
    expect(() => dict.delete(['A'])).toThrow();
  }, 15000);

  it('loads multiple entries with different stroke lengths', async () => {
    const file = createTempPythonDict([
      'LONGEST_KEY = 3',
      'ENTRIES = {',
      "    ('TEFT',): 'test',",
      "    ('HELO',): 'hello',",
      "    ('TEFT', 'TEFT'): 'test test',",
      "    ('KAT', 'KOPLT', 'KOPLT'): 'catastrophe',",
      '}',
    ].join('\n'));

    const dict = await loadDictionary(file);
    expect(dict.length).toBe(4);
    expect(dict.longestKey).toBe(3);
    
    // Single stroke lookups
    expect(dict.get(['TEFT'])).toBe('test');
    expect(dict.get(['HELO'])).toBe('hello');
    
    // Multi-stroke lookups
    expect(dict.get(['TEFT', 'TEFT'])).toBe('test test');
    expect(dict.get(['KAT', 'KOPLT', 'KOPLT'])).toBe('catastrophe');
    
    // Non-existent lookups
    expect(dict.get(['NONEXISTENT'])).toBeNull();
    expect(dict.get(['TEFT', 'NONEXISTENT'])).toBeNull();
  }, 15000);

  it('maintains isolated state between different dictionary instances', async () => {
    // Create two different dictionaries
    const file1 = createTempPythonDict([
      'LONGEST_KEY = 1',
      "ENTRIES = {('FIRST',): 'first dictionary'}",
    ].join('\n'));

    const file2 = createTempPythonDict([
      'LONGEST_KEY = 2',
      "ENTRIES = {('SECOND',): 'second dictionary', ('TWO', 'STROKES'): 'two strokes'}",
    ].join('\n'));

    // Load both dictionaries
    const dict1 = await loadDictionary(file1);
    const dict2 = await loadDictionary(file2);

    // Verify they have independent state
    expect(dict1.length).toBe(1);
    expect(dict2.length).toBe(2);
    
    expect(dict1.longestKey).toBe(1);
    expect(dict2.longestKey).toBe(2);

    // Verify entries are isolated
    expect(dict1.get(['FIRST'])).toBe('first dictionary');
    expect(dict1.get(['SECOND'])).toBeNull();
    expect(dict1.get(['TWO', 'STROKES'])).toBeNull();

    expect(dict2.get(['SECOND'])).toBe('second dictionary');
    expect(dict2.get(['TWO', 'STROKES'])).toBe('two strokes');
    expect(dict2.get(['FIRST'])).toBeNull();
  }, 15000);

  it('iterates over all entries correctly', async () => {
    const file = createTempPythonDict([
      'LONGEST_KEY = 2',
      'ENTRIES = {',
      "    ('ALPHA',): 'a',",
      "    ('BETA',): 'b',",
      "    ('CHARLIE', 'DELTA'): 'cd',",
      '}',
    ].join('\n'));

    const dict = await loadDictionary(file);
    
    // Collect all entries via iteration
    const entries: Array<[string[], string]> = [];
    for (const entry of dict.entries()) {
      entries.push(entry);
    }

    expect(entries.length).toBe(3);
    
    // Verify all entries are present (order may vary)
    const entryMap = new Map(entries.map(([k, v]) => [k.join('/'), v]));
    expect(entryMap.get('ALPHA')).toBe('a');
    expect(entryMap.get('BETA')).toBe('b');
    expect(entryMap.get('CHARLIE/DELTA')).toBe('cd');
  }, 15000);

  it('performs reverse lookup correctly', async () => {
    const file = createTempPythonDict([
      'LONGEST_KEY = 2',
      'ENTRIES = {',
      "    ('TEFT',): 'test',",
      "    ('TEFT', 'TEFT'): 'test',",  // Same translation, different strokes
      "    ('OTHER',): 'other',",
      '}',
    ].join('\n'));

    const dict = await loadDictionary(file);
    
    // Reverse lookup for 'test' should return both stroke sequences
    const testResults = dict.reverseLookup('test');
    expect(testResults.size).toBe(2);
    
    // Convert Set to array for easier checking
    const testArray = Array.from(testResults);
    const signatures = testArray.map(strokes => strokes.join('/'));
    expect(signatures).toContain('TEFT');
    expect(signatures).toContain('TEFT/TEFT');
    
    // Reverse lookup for 'other' should return one result
    const otherResults = dict.reverseLookup('other');
    expect(otherResults.size).toBe(1);
    
    // Reverse lookup for non-existent translation
    const noResults = dict.reverseLookup('nonexistent');
    expect(noResults.size).toBe(0);
  }, 15000);

  it('performs case-insensitive reverse lookup correctly', async () => {
    const file = createTempPythonDict([
      'LONGEST_KEY = 1',
      'ENTRIES = {',
      "    ('TEFT',): 'Test',",
      "    ('TEFT2',): 'TEST',",
      "    ('TEFT3',): 'test',",
      '}',
    ].join('\n'));

    const dict = await loadDictionary(file);
    
    // Case-insensitive lookup should find all variants
    const results = dict.caseReverseLookup('test');
    expect(results.size).toBe(3);
    expect(results.has('Test')).toBe(true);
    expect(results.has('TEST')).toBe(true);
    expect(results.has('test')).toBe(true);
  }, 15000);

  it('has() returns correct boolean for existence check', async () => {
    const file = createTempPythonDict([
      'LONGEST_KEY = 2',
      'ENTRIES = {',
      "    ('EXISTS',): 'yes',",
      "    ('MULTI', 'STROKE'): 'also yes',",
      '}',
    ].join('\n'));

    const dict = await loadDictionary(file);
    
    expect(dict.has(['EXISTS'])).toBe(true);
    expect(dict.has(['MULTI', 'STROKE'])).toBe(true);
    expect(dict.has(['DOES_NOT_EXIST'])).toBe(false);
    expect(dict.has(['MULTI'])).toBe(false);
    expect(dict.has(['STROKE'])).toBe(false);
  }, 15000);

  it('items() returns array of all entries', async () => {
    const file = createTempPythonDict([
      'LONGEST_KEY = 1',
      'ENTRIES = {',
      "    ('ONE',): '1',",
      "    ('TWO',): '2',",
      "    ('THREE',): '3',",
      '}',
    ].join('\n'));

    const dict = await loadDictionary(file);
    
    const items = dict.items();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(3);
    
    const itemMap = new Map(items.map(([k, v]) => [k.join('/'), v]));
    expect(itemMap.get('ONE')).toBe('1');
    expect(itemMap.get('TWO')).toBe('2');
    expect(itemMap.get('THREE')).toBe('3');
  }, 15000);

  it('throws appropriate errors for mutating operations', async () => {
    const file = createTempPythonDict([
      'LONGEST_KEY = 1',
      "ENTRIES = {('TEFT',): 'test'}",
    ].join('\n'));

    const dict = await loadDictionary(file);
    
    expect(() => dict.set(['NEW'], 'value')).toThrow('read-only');
    expect(() => dict.delete(['TEFT'])).toThrow('read-only');
    expect(() => dict.clear()).toThrow('read-only');
    expect(() => dict.update([[['NEW'], 'value']])).toThrow('read-only');
    
    // Verify state unchanged after failed mutations
    expect(dict.length).toBe(1);
    expect(dict.get(['TEFT'])).toBe('test');
  }, 15000);
});
