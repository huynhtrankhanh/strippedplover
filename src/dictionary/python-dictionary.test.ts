import { describe, expect, it } from 'vitest';
import { PythonDictionary } from './python-dictionary.js';

describe('python dictionary loader (SQLite-backed)', () => {
  it('loads a simple dictionary with lookup function', async () => {
    const dict = await PythonDictionary.load({
      TEFT: 'test',
      HELO: 'hello',
    });

    expect(dict.longestKey).toBe(1);
    expect(await dict.get(['TEFT'])).toBe('test');
    expect(await dict.get(['HELO'])).toBe('hello');
    expect(await dict.get(['NONEXISTENT'])).toBeNull();
  });

  it('loads dictionary with multi-stroke entries', async () => {
    const dict = await PythonDictionary.load({
      TEFT: 'test',
      'TEFT/TEFT': 'test test',
      'KAT/AS/TROEF': 'catastrophe',
    });

    expect(dict.longestKey).toBe(3);
    expect(await dict.get(['TEFT'])).toBe('test');
    expect(await dict.get(['TEFT', 'TEFT'])).toBe('test test');
    expect(await dict.get(['KAT', 'AS', 'TROEF'])).toBe('catastrophe');
    expect(await dict.get(['A', 'B', 'C', 'D'])).toBeNull();
  });

  it('maintains isolated state between dictionary instances', async () => {
    const dict1 = await PythonDictionary.load({ FIRST: 'first dictionary' }, { path: 'first' });
    const dict2 = await PythonDictionary.load({ SECOND: 'second dictionary', 'TWO/STROKES': 'two strokes' }, { path: 'second' });

    expect(dict1.longestKey).toBe(1);
    expect(dict2.longestKey).toBe(2);

    expect(await dict1.get(['FIRST'])).toBe('first dictionary');
    expect(await dict1.get(['SECOND'])).toBeNull();

    expect(await dict2.get(['SECOND'])).toBe('second dictionary');
    expect(await dict2.get(['TWO', 'STROKES'])).toBe('two strokes');
    expect(await dict2.get(['FIRST'])).toBeNull();
  });

  it('performs reverse lookup correctly', async () => {
    const dict = await PythonDictionary.load({
      TEFT: 'test',
      'TEFT/TEFT': 'test',
      OTHER: 'other',
    });

    const testResults = await dict.reverseLookup('test');
    expect(testResults.size).toBe(2);

    const otherResults = await dict.reverseLookup('other');
    expect(otherResults.size).toBe(1);

    const noResults = await dict.reverseLookup('nonexistent');
    expect(noResults.size).toBe(0);
  });

  it('throws appropriate errors for mutating operations', async () => {
    const dict = await PythonDictionary.load({ TEFT: 'test' });

    expect(() => dict.set(['NEW'], 'value')).toThrow('read-only');
    expect(() => dict.delete(['TEFT'])).toThrow('read-only');
    expect(() => dict.clear()).toThrow('read-only');
    expect(() => dict.update([[['NEW'], 'value']])).toThrow('read-only');
  });

  it('sets longestKey to zero when no entries are provided', async () => {
    const dict = await PythonDictionary.load({});
    expect(dict.longestKey).toBe(0);
    expect(await dict.get(['ANYTHING'])).toBeNull();
  });

  it('handles has correctly', async () => {
    const dict = await PythonDictionary.load({
      EXISTS: 'yes',
      'MULTI/STROKE': 'also yes',
    });

    expect(await dict.has(['EXISTS'])).toBe(true);
    expect(await dict.has(['MULTI', 'STROKE'])).toBe(true);
    expect(await dict.has(['DOES_NOT_EXIST'])).toBe(false);
    expect(await dict.has(['MULTI'])).toBe(false);
  });

  it('enumerates DICTIONARY entries for export', async () => {
    const dict = await PythonDictionary.load({
      TEFT: 'test',
      'HEL/HROE': 'hello',
    });

    expect(dict.length).toBe(2);
    const items = dict.items();
    expect(items).toContainEqual([['TEFT'], 'test']);
    expect(items).toContainEqual([['HEL', 'HROE'], 'hello']);
  });
});
