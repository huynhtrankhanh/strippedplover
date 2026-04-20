import { describe, it, expect } from 'vitest';
import { StrippedPlover } from './engine.js';

describe('entry search and enumeration APIs', () => {
  async function createEngineWithEntries(): Promise<{ engine: StrippedPlover; mainName: string; altName: string }> {
    const engine = new StrippedPlover(':memory:');
    const mainName = '/dicts/main.json';
    const altName = '/dicts/alt.json';

    await engine.handleRequest({
      id: '1',
      method: 'import_dictionary',
      params: {
        name: mainName,
        type: 'json',
        data: {
          ST: 'sun',
          'LONG/ER': 'sunrise',
          A: 'apple',
          B: 'beta',
        },
      },
    });

    await engine.handleRequest({
      id: '2',
      method: 'import_dictionary',
      params: {
        name: altName,
        type: 'json',
        data: {
          Z: 'zebra',
          CAT: 'cat',
        },
      },
    });

    return { engine, mainName, altName };
  }

  it('enumerates entries with pagination', async () => {
    const { engine } = await createEngineWithEntries();

    const response = await engine.handleRequest({
      id: '3',
      method: 'enumerate_entries',
      params: {
        page: 2,
        page_size: 2,
        sort: 'alphabetic',
      },
    });

    expect(response.result?.total).toBe(6);
    expect(response.result?.page).toBe(2);
    expect(response.result?.page_size).toBe(2);
    expect(response.result?.has_more).toBe(true);
    expect(response.result?.entries).toEqual([
      { dictionary: '/dicts/main.json', stroke: 'B', translation: 'beta' },
      { dictionary: '/dicts/alt.json', stroke: 'CAT', translation: 'cat' },
    ]);
  });

  it('filters and sorts search results by stroke/output criteria', async () => {
    const { engine } = await createEngineWithEntries();

    const shortFirst = await engine.handleRequest({
      id: '4',
      method: 'search_entries',
      params: {
        output: 'sun',
        sort: 'short_first',
      },
    });

    expect(shortFirst.result?.entries).toEqual([
      { dictionary: '/dicts/main.json', stroke: 'ST', translation: 'sun' },
      { dictionary: '/dicts/main.json', stroke: 'LONG/ER', translation: 'sunrise' },
    ]);

    const longFirst = await engine.handleRequest({
      id: '5',
      method: 'search_entries',
      params: {
        output: 'sun',
        sort: 'long_first',
      },
    });

    expect(longFirst.result?.entries).toEqual([
      { dictionary: '/dicts/main.json', stroke: 'LONG/ER', translation: 'sunrise' },
      { dictionary: '/dicts/main.json', stroke: 'ST', translation: 'sun' },
    ]);
  });

  it('supports dictionary filtering with suffix identifiers', async () => {
    const { engine } = await createEngineWithEntries();

    const response = await engine.handleRequest({
      id: '6',
      method: 'enumerate_entries',
      params: {
        dictionary: 'main.json',
        sort: 'alphabetic',
      },
    });

    const entries = response.result?.entries as Array<{ dictionary: string }>;
    expect(entries.every(entry => entry.dictionary === '/dicts/main.json')).toBe(true);
    expect(response.result?.total).toBe(4);
  });
});
