import { describe, it, expect } from 'vitest';
import { StrippedPlover } from './engine.js';
import { Stroke, getStrokeConfig, normalizeSteno } from './stroke.js';

describe('engine python dictionary import/export', () => {
  it('imports and exports python dictionaries via protocol', async () => {
    const engine = new StrippedPlover(':memory:');

    const pythonCode = `
LONGEST_KEY = 2

DICTIONARY = {
    ('TEFT',): 'test',
    ('HEL', 'HROE'): 'hello',
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)

def reverse_lookup(value):
    return [k for k, v in DICTIONARY.items() if v == value]
`;

    const importResponse = await engine.handleRequest({
      id: '1',
      method: 'import_dictionary',
      params: {
        name: 'custom-python',
        type: 'python',
        pythonCode,
      },
    });

    expect(importResponse.result?.entries).toBe(2);
    expect(importResponse.result?.type).toBe('python');

    const exportResponse = await engine.handleRequest({
      id: '2',
      method: 'export_dictionary',
      params: { name: 'custom-python' },
    });

    expect(exportResponse.result?.type).toBe('python');
    expect(exportResponse.result?.pythonCode).toBe(pythonCode);

    const translation = await engine.handleRequest({
      id: '3',
      method: 'translate',
      params: { stroke: 'TEFT' },
    });

    expect(translation.result?.output).toEqual([{ type: 'preedit', text: 'test' }]);
  }, 60000);

  it('imports and exports JSON dictionaries via protocol', async () => {
    const engine = new StrippedPlover(':memory:');

    const importResponse = await engine.handleRequest({
      id: '1',
      method: 'import_dictionary',
      params: {
        name: 'my-json-dict',
        type: 'json',
        data: {
          TEFT: 'test',
          'HEL/HROE': 'hello',
        },
      },
    });

    expect(importResponse.result?.entries).toBe(2);
    expect(importResponse.result?.type).toBe('json');

    const exportResponse = await engine.handleRequest({
      id: '2',
      method: 'export_dictionary',
      params: { name: 'my-json-dict' },
    });

    expect(exportResponse.result?.type).toBe('json');
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

  it('imports large JSON dictionaries efficiently without exhausting memory', async () => {
    const engine = new StrippedPlover(':memory:');

    const cfg = getStrokeConfig();
    const availableKeys = cfg.keys;
    const chunkMask = (1 << availableKeys.length) - 1;

    function chordFromBits(bits: number): string {
      const subset: string[] = [];
      let mask = 1;
      for (let k = 0; k < availableKeys.length; k++) {
        if (bits & mask) {
          subset.push(availableKeys[k]);
        }
        mask <<= 1;
      }
      if (subset.length === 0) {
        subset.push(availableKeys[0]);
      }
      return Stroke.fromKeys(subset).rtfcre;
    }

    const largeData: Record<string, string> = {};
    const normalizedData = new Map<string, string>();
    for (let i = 0; i < 2000; i++) {
      let value = i + 1; // avoid empty subset
      const strokes: string[] = [];
      do {
        const chunk = value & chunkMask;
        strokes.push(chordFromBits(chunk));
        value >>= availableKeys.length;
      } while (value > 0);

      const stroke = strokes.join('/');
      largeData[stroke] = `translation-${i}`;
      normalizedData.set(normalizeSteno(stroke, false).join('/'), `translation-${i}`);
    }
    const normalizedCount = normalizedData.size;
    expect(normalizedCount).toBeGreaterThan(1000);

    const sampleNormalizedStroke = Array.from(normalizedData.keys())[42 % normalizedCount];

    const importResponse = await engine.handleRequest({
      id: '1',
      method: 'import_dictionary',
      params: {
        name: 'bulk-json',
        type: 'json',
        data: largeData,
      },
    });

    const db = (engine as any).db;
    const countResult = db.prepare('SELECT COUNT(*) as count FROM entries WHERE dictionary = ?').get('bulk-json') as { count: number };
    expect(countResult.count).toBe(normalizedCount);
    expect(importResponse.result?.entries).toBe(normalizedCount);

    const exportResponse = await engine.handleRequest({
      id: '2',
      method: 'export_dictionary',
      params: { name: 'bulk-json' },
    });

    const exportedData = exportResponse.result?.data as Record<string, string> | undefined;
    expect(Object.keys(exportedData ?? {})).toHaveLength(normalizedCount);
    expect(exportedData?.[sampleNormalizedStroke]).toBe(normalizedData.get(sampleNormalizedStroke));
  }, 60000);
});
