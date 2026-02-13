import { describe, it, expect, beforeAll } from 'vitest';
import { Translation } from './translation.js';
import { DerivedText } from './derived-text.js';
import { Stroke } from './stroke.js';
import * as system from './system/index.js';

describe('DerivedText graph', () => {
  beforeAll(() => {
    system.setup('English Stenotype');
  });

  it('derives strings through parent chains without storing full copies', () => {
    const base = new Translation([Stroke.fromInteger(1)], 'base');
    const extendedDerivation = DerivedText.append(base.englishDerivation, ' suffix');
    const extended = new Translation([Stroke.fromInteger(2)], extendedDerivation);

    expect(base.english).toBe('base');
    expect(extended.english).toBe('base suffix');
    expect(extended.englishDerivation?.parent).toBe(base.englishDerivation);
  });

  it('combines existing derivations without materializing intermediate strings', () => {
    const left = new Translation([Stroke.fromInteger(3)], 'left');
    const right = new Translation([Stroke.fromInteger(4)], ' right');

    const combinedDerivation = DerivedText.appendDerivation(left.englishDerivation, right.englishDerivation);
    const combined = new Translation([Stroke.fromInteger(5)], combinedDerivation);

    expect(combined.english).toBe('left right');
    expect(combined.englishDerivation?.parent).toBeDefined();
  });
});
