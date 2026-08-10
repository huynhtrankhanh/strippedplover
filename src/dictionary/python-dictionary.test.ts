import { describe, expect, it } from 'vitest';
import { PythonDictionary } from './python-dictionary.js';

/**
 * Tests for Python dictionary using the plover-python-dictionary format.
 * 
 * The plover-python-dictionary format requires:
 * - LONGEST_KEY: int - Maximum number of strokes
 * - lookup(key: tuple) -> str - Returns translation or raises KeyError
 * - reverse_lookup(value: str) -> list - Optional, returns stroke tuples
 * 
 * Python dictionaries are now loaded from code strings, not files.
 */
describe('python dictionary (plover-python-dictionary format)', () => {
  it('loads a simple dictionary with lookup function', async () => {
    const code = `
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
`;

    const dict = await PythonDictionary.loadFromCode('test-dict', code);
    expect(dict.longestKey).toBe(1);
    
    // Test async lookups
    expect(await dict.get(['TEFT'])).toBe('test');
    expect(await dict.get(['HELO'])).toBe('hello');
    expect(await dict.get(['NONEXISTENT'])).toBeNull();
    
    // Verify pythonCode is stored
    expect(dict.pythonCode).toBe(code);
    
    dict.terminate();
  }, 30000);

  it('loads dictionary with multi-stroke entries', async () => {
    const code = `
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
`;

    const dict = await PythonDictionary.loadFromCode('multi-stroke-dict', code);
    expect(dict.longestKey).toBe(3);
    
    expect(await dict.get(['TEFT'])).toBe('test');
    expect(await dict.get(['TEFT', 'TEFT'])).toBe('test test');
    expect(await dict.get(['KAT', 'AS', 'TROEF'])).toBe('catastrophe');
    
    // Key longer than LONGEST_KEY should return null
    expect(await dict.get(['A', 'B', 'C', 'D'])).toBeNull();
    
    dict.terminate();
  }, 30000);

  it('maintains isolated state between dictionary instances', async () => {
    const code1 = `
LONGEST_KEY = 1

DICTIONARY = {('FIRST',): 'first dictionary'}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)
`;

    const code2 = `
LONGEST_KEY = 2

DICTIONARY = {
    ('SECOND',): 'second dictionary',
    ('TWO', 'STROKES'): 'two strokes'
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)
`;

    const dict1 = await PythonDictionary.loadFromCode('dict1', code1);
    const dict2 = await PythonDictionary.loadFromCode('dict2', code2);

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
    const code = `
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
`;

    const dict = await PythonDictionary.loadFromCode('reverse-dict', code);
    
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

  it('validates LONGEST_KEY is required', async () => {
    const code = `
def lookup(key):
    return 'test'
`;

    await expect(PythonDictionary.loadFromCode('no-longest-key', code)).rejects.toThrow('LONGEST_KEY');
  }, 30000);

  it('validates lookup function is required', async () => {
    const code = `
LONGEST_KEY = 1
# No lookup function defined
`;

    await expect(PythonDictionary.loadFromCode('no-lookup', code)).rejects.toThrow('lookup');
  }, 30000);

  it('handles has correctly', async () => {
    const code = `
LONGEST_KEY = 2

DICTIONARY = {
    ('EXISTS',): 'yes',
    ('MULTI', 'STROKE'): 'also yes',
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)
`;

    const dict = await PythonDictionary.loadFromCode('has-dict', code);
    
    expect(await dict.has(['EXISTS'])).toBe(true);
    expect(await dict.has(['MULTI', 'STROKE'])).toBe(true);
    expect(await dict.has(['DOES_NOT_EXIST'])).toBe(false);
    expect(await dict.has(['MULTI'])).toBe(false);

    dict.terminate();
  }, 30000);

  it('treats DICTIONARY as private implementation state', async () => {
    const code = `
LONGEST_KEY = 1

DICTIONARY = {
    ('TEFT',): 'do not introspect me',
}

def lookup(key):
    if key == ('TEFT',):
        return 'actual lookup result'
    raise KeyError(key)
`;

    const dict = await PythonDictionary.loadFromCode('export-dict', code);

    expect(dict.length).toBe(-1);
    expect(dict.longestKey).toBe(1);
    expect(await dict.get(['TEFT'])).toBe('actual lookup result');
    expect(await dict.reverseLookup('do not introspect me')).toEqual(new Set());

    dict.terminate();
  }, 30000);
});

/**
 * Security tests: Verify that the Python sandbox blocks dangerous operations.
 * These tests ensure that malicious Python code cannot escape the sandbox.
 */
describe('python sandbox security', () => {
  it('cannot read files from the host filesystem', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    try:
        with open('/etc/passwd', 'r') as host_file:
            return 'escaped: ' + host_file.read(32)
    except Exception as e:
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('host-read-test', code);
    await expect(dict.get(['TEST'])).resolves.toMatch(/^blocked:/);
    dict.terminate();
  }, 30000);

  it('cannot write files to the host filesystem', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    try:
        with open('/tmp/strippedplover-sandbox-escape', 'w') as host_file:
            host_file.write('escaped')
        return 'escaped'
    except Exception as e:
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('host-write-test', code);
    await expect(dict.get(['TEST'])).resolves.toMatch(/^blocked:/);
    dict.terminate();
  }, 30000);

  it('blocks os.system shell command execution', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    import os
    # Attempt to execute a shell command
    try:
        result = os.system('echo pwned')
        # os.system returns -1 when blocked (not 0 which indicates success)
        if result == 0:
            return 'executed: success'
        else:
            return f'blocked: returned {result}'
    except Exception as e:
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('system-test', code);
    const result = await dict.get(['TEST']);
    
    // Should return -1 (blocked) not 0 (success)
    expect(result).toMatch(/blocked/i);
    
    dict.terminate();
  }, 30000);

  it('blocks os.fork subprocess creation', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    import os
    try:
        pid = os.fork()
        return f'forked: {pid}'
    except Exception as e:
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('fork-test', code);
    const result = await dict.get(['TEST']);
    
    // Should be blocked
    expect(result).toMatch(/blocked|NotImplemented|error|None/i);
    
    dict.terminate();
  }, 30000);

  it('blocks os.execve command execution', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    import os
    try:
        os.execve('/bin/sh', ['/bin/sh', '-c', 'echo pwned'], {})
        return 'executed'
    except Exception as e:
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('execve-test', code);
    const result = await dict.get(['TEST']);
    
    // Should be blocked
    expect(result).toMatch(/blocked|NotImplemented|error|None/i);
    
    dict.terminate();
  }, 30000);

  it('blocks subprocess module operations', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    try:
        import subprocess
        result = subprocess.run(['echo', 'pwned'], capture_output=True)
        return f'executed: {result.stdout}'
    except Exception as e:
        # Blocked at WASM layer - subprocess operations fail
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('subprocess-test', code);
    const result = await dict.get(['TEST']);
    
    // Should be blocked - subprocess operations fail at WASM layer
    expect(result).toMatch(/blocked|error|None/i);
    
    dict.terminate();
  }, 30000);

  it('blocks socket module operations', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(('example.com', 80))
        return 'connected'
    except Exception as e:
        # Blocked at WASM layer - socket operations fail
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('socket-test', code);
    const result = await dict.get(['TEST']);
    
    // Should be blocked - socket operations fail at WASM layer
    expect(result).toMatch(/blocked|error/i);
    
    dict.terminate();
  }, 30000);

  it('blocks js module import for WASM escape', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    try:
        import js
        # Attempt to access JavaScript runtime
        return 'js module loaded'
    except Exception as e:
        # js module doesn't exist in this WASM environment
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('js-test', code);
    const result = await dict.get(['TEST']);
    
    // Should fail - js module is not available
    expect(result).toMatch(/blocked|error|None/i);
    
    dict.terminate();
  }, 30000);

  it('blocks os.popen command execution', async () => {
    const code = `
LONGEST_KEY = 1

def lookup(key):
    import os
    try:
        f = os.popen('echo pwned')
        result = f.read()
        return f'executed: {result}'
    except Exception as e:
        return f'blocked: {type(e).__name__}'
`;

    const dict = await PythonDictionary.loadFromCode('popen-test', code);
    const result = await dict.get(['TEST']);
    
    // Should be blocked
    expect(result).toMatch(/blocked|NotImplemented|error|None/i);
    
    dict.terminate();
  }, 30000);
});
