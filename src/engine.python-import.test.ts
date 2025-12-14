import { describe, it, expect } from 'vitest';
import { StrippedPlover } from './engine.js';

describe('engine python dictionary import/export', () => {
  it('imports and exports python dictionaries via protocol', async () => {
    const engine = new StrippedPlover();

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
    const engine = new StrippedPlover();

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
});
