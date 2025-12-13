import { describe, expect, it, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PythonDictionary } from './python-dictionary.js';

/**
 * Tests for Python dictionary loader using the plover-python-dictionary format.
 * 
 * The plover-python-dictionary format requires:
 * - LONGEST_KEY: int - Maximum number of strokes
 * - lookup(key: tuple) -> str - Returns translation or raises KeyError
 * - reverse_lookup(value: str) -> list - Optional, returns stroke tuples
 */
describe('python dictionary loader (plover-python-dictionary format)', () => {
  const tempFiles: string[] = [];

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

  it('loads a simple dictionary with lookup function', async () => {
    const file = createTempPythonDict(`
LONGEST_KEY = 1

DICTIONARY = {
    ('TEFT',): 'test',
    ('HELO',): 'hello',
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)

def reverse_lookup(value):
    return [k for k, v in DICTIONARY.items() if v == value]
`);

    const dict = await PythonDictionary.load(file);
    expect(dict.longestKey).toBe(1);
    
    // Test async lookups
    expect(await dict.get(['TEFT'])).toBe('test');
    expect(await dict.get(['HELO'])).toBe('hello');
    expect(await dict.get(['NONEXISTENT'])).toBeNull();
    
    dict.terminate();
  }, 30000);

  it('loads dictionary with multi-stroke entries', async () => {
    const file = createTempPythonDict(`
LONGEST_KEY = 3

DICTIONARY = {
    ('TEFT',): 'test',
    ('TEFT', 'TEFT'): 'test test',
    ('KAT', 'AS', 'TROEF'): 'catastrophe',
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)
`);

    const dict = await PythonDictionary.load(file);
    expect(dict.longestKey).toBe(3);
    
    expect(await dict.get(['TEFT'])).toBe('test');
    expect(await dict.get(['TEFT', 'TEFT'])).toBe('test test');
    expect(await dict.get(['KAT', 'AS', 'TROEF'])).toBe('catastrophe');
    
    // Key longer than LONGEST_KEY should return null
    expect(await dict.get(['A', 'B', 'C', 'D'])).toBeNull();
    
    dict.terminate();
  }, 30000);

  it('maintains isolated state between dictionary instances', async () => {
    const file1 = createTempPythonDict(`
LONGEST_KEY = 1

DICTIONARY = {('FIRST',): 'first dictionary'}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)
`);

    const file2 = createTempPythonDict(`
LONGEST_KEY = 2

DICTIONARY = {
    ('SECOND',): 'second dictionary',
    ('TWO', 'STROKES'): 'two strokes'
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)
`);

    const dict1 = await PythonDictionary.load(file1);
    const dict2 = await PythonDictionary.load(file2);

    // Verify independent state
    expect(dict1.longestKey).toBe(1);
    expect(dict2.longestKey).toBe(2);

    // Verify entries are isolated
    expect(await dict1.get(['FIRST'])).toBe('first dictionary');
    expect(await dict1.get(['SECOND'])).toBeNull();

    expect(await dict2.get(['SECOND'])).toBe('second dictionary');
    expect(await dict2.get(['TWO', 'STROKES'])).toBe('two strokes');
    expect(await dict2.get(['FIRST'])).toBeNull();

    dict1.terminate();
    dict2.terminate();
  }, 60000);

  it('performs reverse lookup correctly', async () => {
    const file = createTempPythonDict(`
LONGEST_KEY = 2

DICTIONARY = {
    ('TEFT',): 'test',
    ('TEFT', 'TEFT'): 'test',
    ('OTHER',): 'other',
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)

def reverse_lookup(value):
    return [k for k, v in DICTIONARY.items() if v == value]
`);

    const dict = await PythonDictionary.load(file);
    
    // Reverse lookup for 'test' should return both stroke sequences
    const testResults = await dict.reverseLookup('test');
    expect(testResults.size).toBe(2);
    
    // Reverse lookup for 'other' should return one result
    const otherResults = await dict.reverseLookup('other');
    expect(otherResults.size).toBe(1);
    
    // Reverse lookup for non-existent translation
    const noResults = await dict.reverseLookup('nonexistent');
    expect(noResults.size).toBe(0);

    dict.terminate();
  }, 30000);

  it('throws appropriate errors for mutating operations', async () => {
    const file = createTempPythonDict(`
LONGEST_KEY = 1

def lookup(key):
    if key == ('TEFT',):
        return 'test'
    raise KeyError(key)
`);

    const dict = await PythonDictionary.load(file);
    
    expect(() => dict.set(['NEW'], 'value')).toThrow('read-only');
    expect(() => dict.delete(['TEFT'])).toThrow('read-only');
    expect(() => dict.clear()).toThrow('read-only');
    expect(() => dict.update([[['NEW'], 'value']])).toThrow('read-only');

    dict.terminate();
  }, 30000);

  it('validates LONGEST_KEY is required', async () => {
    const file = createTempPythonDict(`
def lookup(key):
    return 'test'
`);

    await expect(PythonDictionary.load(file)).rejects.toThrow('LONGEST_KEY');
  }, 30000);

  it('validates lookup function is required', async () => {
    const file = createTempPythonDict(`
LONGEST_KEY = 1
# No lookup function defined
`);

    await expect(PythonDictionary.load(file)).rejects.toThrow('lookup');
  }, 30000);

  it('handles has correctly', async () => {
    const file = createTempPythonDict(`
LONGEST_KEY = 2

DICTIONARY = {
    ('EXISTS',): 'yes',
    ('MULTI', 'STROKE'): 'also yes',
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)
`);

    const dict = await PythonDictionary.load(file);
    
    expect(await dict.has(['EXISTS'])).toBe(true);
    expect(await dict.has(['MULTI', 'STROKE'])).toBe(true);
    expect(await dict.has(['DOES_NOT_EXIST'])).toBe(false);
    expect(await dict.has(['MULTI'])).toBe(false);

    dict.terminate();
  }, 30000);
});
