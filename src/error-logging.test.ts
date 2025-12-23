import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Formatter } from './formatting.js';
import { registry } from './registry.js';
import { Stroke } from './stroke.js';
import { Translation, Translator } from './translation.js';
import { setup as setupSystem } from './system/index.js';

beforeAll(() => {
  setupSystem('English Stenotype');
});

describe('error logging', () => {
  it('logs macro execution errors to stderr', async () => {
    const translator = new Translator();
    const macroName = 'macro_logging_test';
    registry.registerPlugin('macro', macroName, () => {
      throw new Error('macro failed');
    });
    const macro = { name: macroName, stroke: Stroke.fromSteno('T-'), cmdline: '' };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await translator.translateMacro(macro);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`macro "${macroName}"`),
        expect.any(Error)
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs meta execution errors to stderr', () => {
    const formatter = new Formatter();
    const metaName = 'meta_logging_test';
    const translation = new Translation([Stroke.fromSteno('T-')], `{:${metaName}:}`);
    registry.registerPlugin('meta', metaName, () => {
      throw new Error('meta failed');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      formatter.format([], [translation], null);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`meta "${metaName}"`),
        expect.any(Error)
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
