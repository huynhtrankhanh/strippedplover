import { beforeAll, describe, expect, it } from 'vitest';
import { addSuffix } from './orthography.js';
import * as system from './system/index.js';

describe('orthography', () => {
  beforeAll(() => system.setup('English Stenotype'));

  it.each([
    ['pigment', 'ed', 'pigmented'],
    ['target', 'ing', 'targeting'],
    ['limit', 'er', 'limiter'],
    ['monitor', 'ing', 'monitoring'],
    ['refer', 'ed', 'referred'],
    ['equip', 'ed', 'equipped'],
  ])('adds %s + %s using word-list prominence', (word, suffix, expected) => {
    expect(addSuffix(word, suffix)).toBe(expected);
  });
});
