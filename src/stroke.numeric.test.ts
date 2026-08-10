import { beforeAll, describe, expect, it } from 'vitest';
import { Stroke } from './stroke.js';
import * as system from './system/index.js';

describe('numeric RTFCRE strokes', () => {
  beforeAll(() => system.setup('English Stenotype'));

  it.each(['12', '234-6R', '2E', '123W450U8G9', '12RE68S'])(
    'round-trips %s through the serializer',
    steno => {
      const stroke = Stroke.fromSteno(steno);
      expect(Stroke.fromSteno(stroke.rtfcre).value).toBe(stroke.value);
    }
  );

  it('round-trips every number-bar key combination', () => {
    const numberKeys = ['S-', 'T-', 'P-', 'H-', 'A-', 'O-', '-F', '-P', '-L', '-T'];
    for (let mask = 1; mask < 1 << numberKeys.length; mask++) {
      const keys = ['#', ...numberKeys.filter((_, index) => mask & (1 << index))];
      const stroke = Stroke.fromKeys(keys);
      expect(Stroke.fromSteno(stroke.rtfcre).value, stroke.rtfcre).toBe(stroke.value);
    }
  });
});
