import { beforeEach, describe, expect, it } from 'vitest';
import { StrippedPlover } from './engine.js';

describe('atomic dictionary mutation RPC methods', () => {
  let engine: StrippedPlover;

  beforeEach(async () => {
    engine = new StrippedPlover(':memory:');
    await engine.handleRequest({
      id: 'import',
      method: 'import_dictionary',
      params: { name: 'main.json', type: 'json', data: { TEFT: 'test' } },
    });
  });

  it('adds a normalized stroke without overwriting an existing entry', async () => {
    const added = await engine.handleRequest({
      id: 1,
      method: 'add_entry_safely',
      params: { name: 'main.json', stroke: 'TPH / TPH', translation: 'new' },
    });
    expect(added.result).toEqual({
      status: 'ok',
      conflict: false,
      stroke: 'TPH/TPH',
      translation: 'new',
    });

    const conflict = await engine.handleRequest({
      id: 2,
      method: 'add_entry_safely',
      params: { name: 'main.json', stroke: 'TEFT', translation: 'overwritten' },
    });
    expect(conflict.result).toEqual({
      status: 'conflict',
      conflict: true,
      stroke: 'TEFT',
      existing_translation: 'test',
    });

    const entries = await engine.handleRequest({
      id: 3,
      method: 'get_dictionary_entries',
      params: { name: 'main.json' },
    });
    expect(entries.result?.entries).toEqual(expect.arrayContaining([
      { stroke: 'TEFT', translation: 'test' },
      { stroke: 'TPH/TPH', translation: 'new' },
    ]));
  });

  it('replaces only the translation that the caller observed', async () => {
    const replaced = await engine.handleRequest({
      id: 1,
      method: 'replace_entry',
      params: {
        name: 'main.json',
        stroke: 'TEFT',
        translation: 'updated',
        expected_translation: 'test',
      },
    });
    expect(replaced.result).toEqual({
      status: 'ok',
      conflict: false,
      stroke: 'TEFT',
      translation: 'updated',
    });

    for (const [stroke, expected] of [['TEFT', 'stale'], ['PH', 'missing']]) {
      const conflict = await engine.handleRequest({
        id: stroke,
        method: 'replace_entry',
        params: { name: 'main.json', stroke, translation: 'unsafe', expected_translation: expected },
      });
      expect(conflict.result).toEqual({ status: 'conflict', conflict: true, stroke });
    }

    const entries = await engine.handleRequest({
      id: 3,
      method: 'get_dictionary_entries',
      params: { name: 'main.json' },
    });
    expect(entries.result?.entries).toContainEqual({ stroke: 'TEFT', translation: 'updated' });
  });

  it.each([
    ['add_entry_safely', { name: 'main.json', stroke: '', translation: 'value' }],
    ['add_entry_safely', { name: 'main.json', stroke: 'TEFT', translation: '' }],
    ['replace_entry', { name: 'main.json', stroke: '', translation: 'value', expected_translation: 'test' }],
    ['replace_entry', { name: 'main.json', stroke: 'TEFT', translation: '', expected_translation: 'test' }],
    ['replace_entry', { name: 'main.json', stroke: 'TEFT', translation: 'value' }],
    ['replace_entry', { name: 'main.json', stroke: 'TEFT', translation: 'value', expected_translation: 1 }],
  ])('validates parameters for %s', async (method, params) => {
    const response = await engine.handleRequest({ id: 1, method, params });
    expect(response.error?.message).toMatch(/required/);
  });

  it.each(['add_entry_safely', 'replace_entry'])('rejects missing and non-concrete dictionaries for %s', async method => {
    const params = {
      name: 'missing.json',
      stroke: 'TEFT',
      translation: 'value',
      expected_translation: 'test',
    };
    const missing = await engine.handleRequest({ id: 1, method, params });
    expect(missing.error?.message).toBe('Dictionary not found: missing.json');

    const nonConcrete = { identifier: 'commands.py' };
    (engine as any).dictionaries.setDicts([nonConcrete]);
    const python = await engine.handleRequest({
      id: 2,
      method,
      params: { ...params, name: 'commands.py' },
    });
    expect(python.error?.message).toBe('Dictionary does not expose concrete entries: commands.py');
  });

  it.each(['add_entry', 'update_entry'])('removes the unsafe %s RPC', async method => {
    const response = await engine.handleRequest({ id: 1, method, params: {} });
    expect(response.error).toEqual({ code: -32601, message: `Unknown method: ${method}` });
  });
});
