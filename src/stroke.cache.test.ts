import { afterAll, describe, expect, it } from 'vitest';
import { setupStroke, normalizeStroke } from './stroke.js';
import { setup as setupSystem } from './system/index.js';

const numberEnabledConfig = {
  keys: ['#', 'S-'] as const,
  implicitHyphenKeys: new Set<string>(),
  numberKey: '#',
  numbers: new Map<string, string>([['S-', '1-']]),
  feralNumberKey: false,
  undoStrokeSteno: '*',
};

const numberlessConfig = {
  keys: ['S-'] as const,
  implicitHyphenKeys: new Set<string>(),
  numberKey: null,
  numbers: new Map<string, string>(),
  feralNumberKey: false,
  undoStrokeSteno: '*',
};

describe('stroke normalization cache', () => {
  afterAll(() => {
    setupSystem('English Stenotype');
  });

  it('clears cached normalizations when the stroke system is reconfigured', () => {
    setupStroke(numberEnabledConfig);
    expect(normalizeStroke('#S-')).toBe('1');

    setupStroke(numberlessConfig);
    expect(normalizeStroke('#S-', false)).toBe('S');
  });
});
