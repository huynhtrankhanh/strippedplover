import { beforeAll, describe, expect, it } from 'vitest';
import { Stroke, normalizeSteno } from './stroke.js';
import * as system from './system/index.js';

describe('numeric RTFCRE strokes', () => {
  beforeAll(() => system.setup('English Stenotype'));

  it.each([
    ['12', ['#', 'S-', 'T-']],
    ['234-6R', ['#', 'T-', 'P-', 'H-', '-F', '-R']],
    ['2E', ['#', 'T-', '-E']],
    ['123W450U8G9', ['#', 'S-', 'T-', 'P-', 'W-', 'H-', 'A-', 'O-', '-U', '-L', '-G', '-T']],
    ['12RE68S', ['#', 'S-', 'T-', 'R-', '-E', '-F', '-L', '-S']],
  ])('parses and round-trips mixed numeric stroke %s', (steno, expectedKeys) => {
      const expected = Stroke.fromKeys(expectedKeys);
      const parsed = Stroke.fromSteno(steno);
      expect(parsed.value).toBe(expected.value);
      expect(parsed.stenoKeys).toEqual(expectedKeys);
      expect(parsed.rtfcre).toBe(steno);
      expect(Stroke.fromSteno(parsed.rtfcre).value).toBe(expected.value);
  });

  it('normalizes mixed numeric multi-stroke outlines without changing them', () => {
    const outline = '12/234-6R/2E/123W450U8G9/12RE68S';
    expect(normalizeSteno(outline)).toEqual(outline.split('/'));
    for (const steno of normalizeSteno(outline)) {
      const stroke = Stroke.fromSteno(steno);
      expect(Stroke.fromSteno(stroke.rtfcre).value).toBe(stroke.value);
    }
  });

  it('round-trips every number-bar key combination', () => {
    const numberKeys = ['S-', 'T-', 'P-', 'H-', 'A-', 'O-', '-F', '-P', '-L', '-T'];
    for (let mask = 1; mask < 1 << numberKeys.length; mask++) {
      const keys = ['#', ...numberKeys.filter((_, index) => mask & (1 << index))];
      const stroke = Stroke.fromKeys(keys);
      expect(Stroke.fromSteno(stroke.rtfcre).value, stroke.rtfcre).toBe(stroke.value);
    }
  });
});
