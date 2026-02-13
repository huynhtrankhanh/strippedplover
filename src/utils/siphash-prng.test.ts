import { describe, it, expect } from 'vitest';
import { SipHashPRNG } from './siphash-prng.js';

describe('SipHashPRNG', () => {
  it('produces deterministic output for a fixed seed', () => {
    const seed = new Uint8Array(16).fill(1);
    const prngA = new SipHashPRNG(seed);
    const prngB = new SipHashPRNG(seed);

    const seqA = [prngA.nextUint32(), prngA.nextUint32(), prngA.nextUint32()];
    const seqB = [prngB.nextUint32(), prngB.nextUint32(), prngB.nextUint32()];

    expect(seqA).toEqual(seqB);
  });

  it('returns values across full uint32 range', () => {
    const prng = new SipHashPRNG(new Uint8Array(16).fill(2));
    const value = prng.nextUint32();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
});
