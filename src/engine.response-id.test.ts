import { describe, it, expect } from 'vitest';
import { StrippedPlover } from './engine.js';

describe('JSON RPC responses', () => {
  it('always include an id field even when request omits id', async () => {
    const engine = new StrippedPlover(':memory:');

    const response = await engine.handleRequest(
      { method: 'get_dictionary_state' } as unknown as any
    );

    const parsed = JSON.parse(JSON.stringify(response));
    expect(parsed).toHaveProperty('id', null);
  });
});
