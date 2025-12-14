
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StrippedPlover } from './engine.js';
import { OutputElement } from './engine.js';

describe('StrippedPlover Comprehensive Tests', () => {
  let engine: StrippedPlover;

  beforeEach(() => {
    engine = new StrippedPlover();
  });

  async function translate(stroke: string): Promise<string> {
    const res = await engine.handleRequest({
      id: 1,
      method: 'translate',
      params: { stroke }
    });
    const output = (res.result as any).output as OutputElement[];
    return output.map(o => o.text || '').join('');
  }

  async function translateRaw(stroke: string): Promise<OutputElement[]> {
    const res = await engine.handleRequest({
      id: 1,
      method: 'translate',
      params: { stroke }
    });
    return (res.result as any).output as OutputElement[];
  }

  describe('Formatting', () => {
    it('handles basic capitalization', async () => {
      await engine.handleRequest({
        id: 1,
        method: 'import_dictionary',
        params: {
          name: 'main',
          type: 'json',
          data: {
            'H-L': 'hello',
            'WORLD': 'world'
          }
        }
      });

      await engine.handleRequest({
        id: 2,
        method: 'set_starting_stroke_state',
        params: { capitalize: true, attach: true }
      });

      expect(await translate('H-L')).toBe('Hello');
      expect(await translate('WORLD')).toBe('Hello world');
    });

    it('handles glue', async () => {
      await engine.handleRequest({
        id: 1,
        method: 'import_dictionary',
        params: {
          name: 'main',
          type: 'json',
          data: {
            'H-L': 'hello',
            'WORLD': 'world',
            '-G': '{&ing}'
          }
        }
      });

      expect(await translate('H-L')).toBe('hello');
      // {&ing} glue only attaches if previous was glue. 'hello' is not glue.
      // So 'hello ing' is expected.
      expect(await translate('-G')).toBe('hello ing');
    });

    it('handles attach', async () => {
        await engine.handleRequest({
          id: 1,
          method: 'import_dictionary',
          params: {
            name: 'main',
            type: 'json',
            data: {
              'PREFIX': '{^prefix}',
              'SUFFIX': '{suffix^}',
              'WORD': 'word'
            }
          }
        });

        expect(await translate('PREFIX')).toBe('prefix');
        // {^prefix} attaches to previous (nothing).
        // WORD follows, so space is inserted.
        expect(await translate('WORD')).toBe('prefix word');

        await engine.handleRequest({ id: 2, method: 'reset_state' });

        expect(await translate('WORD')).toBe('word');
        // {suffix^} attaches to next.
        expect(await translate('SUFFIX')).toBe('word suffix');
        // Wait, {suffix^} means "suffix" is the text, and it sets nextAttach=true.
        // So NEXT word will attach to it.
        expect(await translate('WORD')).toBe('word suffixword');
      });
  });

  describe('Dictionary Management', () => {
    it('prioritizes dictionaries', async () => {
      await engine.handleRequest({
        id: 1,
        method: 'import_dictionary',
        params: {
          name: 'user.json',
          type: 'json',
          data: { 'TEFT': 'user' }
        }
      });
      await engine.handleRequest({
        id: 2,
        method: 'import_dictionary',
        params: {
          name: 'main.json',
          type: 'json',
          data: { 'TEFT': 'main' }
        }
      });

      await engine.handleRequest({
        id: 3,
        method: 'prioritize_dictionaries',
        params: { paths: ['main.json'] }
      });

      expect(await translate('TEFT')).toBe('main');

      await engine.handleRequest({
        id: 4,
        method: 'prioritize_dictionaries',
        params: { paths: ['user.json'] }
      });

      await engine.handleRequest({ id: 5, method: 'reset_state' });
      expect(await translate('TEFT')).toBe('user');
    });

    it('enables and disables dictionaries', async () => {
      await engine.handleRequest({
        id: 1,
        method: 'import_dictionary',
        params: {
          name: 'main.json',
          type: 'json',
          data: { 'TEFT': 'test' }
        }
      });

      expect(await translate('TEFT')).toBe('test');

      await engine.handleRequest({
        id: 2,
        method: 'set_dictionary_enabled',
        params: { path: 'main.json', enabled: false }
      });

      await engine.handleRequest({ id: 3, method: 'reset_state' });
      const res = await translateRaw('TEFT');
      expect(res[0].text).toContain('TEFT');
    });

    it('handles remove_dictionary with path normalization', async () => {
        const path = '/tmp/my-dict.json';
        const resImport = await engine.handleRequest({
            id: 1,
            method: 'import_dictionary',
            params: { name: path, type: 'json', data: {'A': 'b'} }
        });

        expect(resImport.error).toBeUndefined();

        // Remove using path with redundant slashes
        const res = await engine.handleRequest({
            id: 2,
            method: 'remove_dictionary',
            params: { name: '//tmp//my-dict.json' }
        });

        expect(res.error).toBeUndefined();
        expect((res.result as any).name).toBe('//tmp//my-dict.json');
    });
  });

  describe('Solo Mode', () => {
    it('enters and exits solo mode', async () => {
      await engine.handleRequest({
        id: 1,
        method: 'import_dictionary',
        params: {
            name: 'd1',
            type: 'json',
            data: { 'KP': 'one' }
        }
      });
      await engine.handleRequest({
        id: 2,
        method: 'import_dictionary',
        params: {
            name: 'd2',
            type: 'json',
            data: { 'TK': 'two' }
        }
      });

      expect(await translate('KP')).toBe('one');
      expect(await translate('TK')).toBe('one two');

      // Solo d1
      await engine.handleRequest({
        id: 3,
        method: 'solo_dictionaries',
        params: { toggles: ['+d1'] }
      });

      await engine.handleRequest({ id: 4, method: 'reset_state' });
      expect(await translate('KP')).toBe('one');
      const resB = await translateRaw('TK');
      expect(resB[0].text).toContain('TK');

      // End solo
      await engine.handleRequest({
        id: 5,
        method: 'end_solo_dictionaries',
        params: {}
      });

      await engine.handleRequest({ id: 6, method: 'reset_state' });
      expect(await translate('KP')).toBe('one');
      expect(await translate('TK')).toBe('one two');
    });
  });

  describe('CRUD', () => {
      it('adds, updates, removes entries', async () => {
          await engine.handleRequest({
              id: 1,
              method: 'import_dictionary',
              params: { name: 'test', type: 'json', data: {} }
          });

          await engine.handleRequest({
              id: 2,
              method: 'add_entry',
              params: { stroke: 'TEFT', translation: 'test' }
          });
          expect(await translate('TEFT')).toBe('test');

          await engine.handleRequest({
              id: 3,
              method: 'update_entry',
              params: { stroke: 'TEFT', translation: 'updated' }
          });
          await engine.handleRequest({ id: 4, method: 'reset_state' });
          expect(await translate('TEFT')).toBe('updated');

          await engine.handleRequest({
              id: 5,
              method: 'remove_entry',
              params: { stroke: 'TEFT' }
          });
          await engine.handleRequest({ id: 6, method: 'reset_state' });
          const res = await translateRaw('TEFT');
          expect(res[0].text).toContain('TEFT');
      });
  });
});
