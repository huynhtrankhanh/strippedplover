import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PythonDictionary } from './dictionary/python-dictionary.js';

// Mock pyodide
vi.mock('pyodide', () => {
  return {
    loadPyodide: vi.fn(),
  };
});

// Mock fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

describe('PythonDictionary', () => {
  it('is always readonly', () => {
    const dict = new PythonDictionary({ path: 'test.py' });
    expect(dict.readonly).toBe(true);
    
    // Setting readonly should have no effect
    dict.readonly = false;
    expect(dict.readonly).toBe(true);
  });

  it('throws on write operations', () => {
    const dict = new PythonDictionary({ path: 'test.py' });
    
    expect(() => dict.set(['TEST'], 'test')).toThrow('Python dictionaries are read-only');
    expect(() => dict.delete(['TEST'])).toThrow('Python dictionaries are read-only');
    expect(() => dict.clear()).toThrow('Python dictionaries are read-only');
    expect(() => dict.update([[['TEST'], 'test']])).toThrow('Python dictionaries are read-only');
  });

  it('returns empty items for enumeration', () => {
    const dict = new PythonDictionary({ path: 'test.py' });
    
    expect(dict.items()).toEqual([]);
    expect(dict.length).toBe(0);
    expect([...dict.entries()]).toEqual([]);
  });

  it('returns empty toJson', () => {
    const dict = new PythonDictionary({ path: 'test.py' });
    expect(dict.toJson()).toEqual({});
  });

  it('stores basic properties correctly', () => {
    const dict = new PythonDictionary({ path: 'test.py', enabled: false });
    expect(dict.path).toBe('test.py');
    expect(dict.enabled).toBe(false);
    expect(dict.readonly).toBe(true);
    expect(dict.initialized).toBe(false);
  });

  it('returns null for lookups when not initialized', () => {
    const dict = new PythonDictionary({ path: 'test.py' });
    expect(dict.get(['TEST'])).toBeNull();
    expect(dict.has(['TEST'])).toBe(false);
  });

  it('returns empty set for reverse lookup when not initialized', () => {
    const dict = new PythonDictionary({ path: 'test.py' });
    expect(dict.reverseLookup('test').size).toBe(0);
  });

  it('returns empty set for case reverse lookup', () => {
    const dict = new PythonDictionary({ path: 'test.py' });
    expect(dict.caseReverseLookup('test').size).toBe(0);
  });
});

describe('PythonDictionary with mocked Pyodide', () => {
  let mockPyodide: any;
  let mockLoadPyodide: any;

  beforeEach(async () => {
    // Create a mock pyodide instance
    mockPyodide = {
      runPythonAsync: vi.fn(),
      runPython: vi.fn(),
    };
    
    const pyodideModule = await import('pyodide');
    mockLoadPyodide = pyodideModule.loadPyodide as any;
    mockLoadPyodide.mockResolvedValue(mockPyodide);
  });

  it('initializes with python code', async () => {
    const pythonCode = `
LONGEST_KEY = 2

def lookup(strokes):
    raise KeyError
`;

    mockPyodide.runPythonAsync
      .mockResolvedValueOnce(undefined) // execute python code
      .mockResolvedValueOnce(2)          // LONGEST_KEY
      .mockResolvedValueOnce(true);      // hasLookup check

    const dict = await PythonDictionary.createFromSource('test.py', pythonCode);
    
    expect(dict.pythonCode).toBe(pythonCode);
    expect(dict.initialized).toBe(true);
    expect(dict.longestKey).toBe(2);
  });

  it('throws when LONGEST_KEY is invalid', async () => {
    const pythonCode = `
def lookup(strokes):
    raise KeyError
`;

    mockPyodide.runPythonAsync
      .mockResolvedValueOnce(undefined) // execute python code
      .mockResolvedValueOnce(0);        // LONGEST_KEY is 0 - invalid

    await expect(PythonDictionary.createFromSource('test.py', pythonCode))
      .rejects.toThrow('Missing or invalid LONGEST_KEY');
  });

  it('throws when lookup function is missing', async () => {
    const pythonCode = `
LONGEST_KEY = 2
`;

    mockPyodide.runPythonAsync
      .mockResolvedValueOnce(undefined) // execute python code  
      .mockResolvedValueOnce(2)         // LONGEST_KEY
      .mockResolvedValueOnce(false);    // hasLookup check - false

    await expect(PythonDictionary.createFromSource('test.py', pythonCode))
      .rejects.toThrow('Missing or invalid lookup function');
  });

  it('performs lookup on initialized dictionary', async () => {
    const pythonCode = `
LONGEST_KEY = 2

def lookup(strokes):
    if strokes == ("TEFT",):
        return "test"
    raise KeyError
`;

    mockPyodide.runPythonAsync
      .mockResolvedValueOnce(undefined) // execute python code
      .mockResolvedValueOnce(2)         // LONGEST_KEY
      .mockResolvedValueOnce(true);     // hasLookup check

    const dict = await PythonDictionary.createFromSource('test.py', pythonCode);

    // Mock the synchronous runPython for lookup
    mockPyodide.runPython.mockReturnValueOnce('test');
    expect(dict.get(['TEFT'])).toBe('test');
    
    // Mock for not found
    mockPyodide.runPython.mockReturnValueOnce(null);
    expect(dict.get(['UNKNOWN'])).toBeNull();
  });

  it('returns null for strokes longer than LONGEST_KEY', async () => {
    const pythonCode = `LONGEST_KEY = 2`;

    mockPyodide.runPythonAsync
      .mockResolvedValueOnce(undefined) // execute python code
      .mockResolvedValueOnce(2)         // LONGEST_KEY
      .mockResolvedValueOnce(true);     // hasLookup check

    const dict = await PythonDictionary.createFromSource('test.py', pythonCode);
    
    // Should return null without calling runPython
    expect(dict.get(['A', 'B', 'C'])).toBeNull();
    expect(mockPyodide.runPython).not.toHaveBeenCalled();
  });
});
