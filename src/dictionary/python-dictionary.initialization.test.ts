import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const runtime = {
    exec: vi.fn().mockResolvedValue(undefined),
    repr: vi.fn(),
    terminate: vi.fn(),
  };
  return {
    runtime,
    asyncPython: vi.fn().mockResolvedValue(runtime),
  };
});

vi.mock('../../vendor/python-wasm/dist/node.js', () => ({
  asyncPython: mocks.asyncPython,
}));

import { PythonDictionary } from './python-dictionary.js';

describe('PythonDictionary initialization ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtime.exec.mockResolvedValue(undefined);
  });

  it('terminates the allocated runtime when LONGEST_KEY validation fails', async () => {
    mocks.runtime.repr.mockResolvedValueOnce('False');

    await expect(PythonDictionary.loadFromCode('invalid.py', 'pass')).rejects.toThrow('LONGEST_KEY');

    expect(mocks.runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it('terminates the allocated runtime when lookup validation fails', async () => {
    mocks.runtime.repr
      .mockResolvedValueOnce('True')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('False');

    await expect(PythonDictionary.loadFromCode('invalid.py', 'LONGEST_KEY = 1')).rejects.toThrow('lookup');

    expect(mocks.runtime.terminate).toHaveBeenCalledTimes(1);
  });
});
