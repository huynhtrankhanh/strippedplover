import { describe, it, expect, beforeAll } from 'vitest';
import { Translation } from './translation.js';
import { Rope } from './rope.js';
import { Stroke } from './stroke.js';
import * as system from './system/index.js';

describe('Rope treap', () => {
  beforeAll(() => {
    system.setup('English Stenotype');
  });

  it('concatenates strings through parent rope and appended text', () => {
    const base = new Translation([Stroke.fromInteger(1)], 'base');
    const extendedRope = Rope.append(base.englishDerivation, ' suffix');
    const extended = new Translation([Stroke.fromInteger(2)], extendedRope);

    expect(base.english).toBe('base');
    expect(extended.english).toBe('base suffix');
    expect(extended.englishDerivation).not.toBeNull();
  });

  it('combines existing ropes without materializing intermediate strings', () => {
    const left = new Translation([Stroke.fromInteger(3)], 'left');
    const right = new Translation([Stroke.fromInteger(4)], ' right');

    const combinedRope = Rope.appendRope(left.englishDerivation, right.englishDerivation);
    const combined = new Translation([Stroke.fromInteger(5)], combinedRope);

    expect(combined.english).toBe('left right');
  });
});
