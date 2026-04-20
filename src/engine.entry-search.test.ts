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
          TKPWRAOEUS: 'sunrise',
          A: 'apple',
          PWETA: 'beta',
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
          STPWRA: 'zebra',
          KAT: 'cat',
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
      { dictionary: '/dicts/alt.json', stroke: 'KAT', translation: 'cat' },
      { dictionary: '/dicts/main.json', stroke: 'ST', translation: 'sun' },
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
      { dictionary: '/dicts/main.json', stroke: 'TKPWRAOEUS', translation: 'sunrise' },
    ]);
    expect(shortFirst.result?.match).toBe('substring');

    const longFirst = await engine.handleRequest({
      id: '5',
      method: 'search_entries',
      params: {
        output: 'sun',
        sort: 'long_first',
      },
    });

    expect(longFirst.result?.entries).toEqual([
      { dictionary: '/dicts/main.json', stroke: 'TKPWRAOEUS', translation: 'sunrise' },
      { dictionary: '/dicts/main.json', stroke: 'ST', translation: 'sun' },
    ]);
  });

  it('supports prefix match mode for search filters', async () => {
    const { engine } = await createEngineWithEntries();

    const substringResponse = await engine.handleRequest({
      id: '5a',
      method: 'search_entries',
      params: {
        output: 'rise',
      },
    });
    expect(substringResponse.result?.entries).toEqual([
      { dictionary: '/dicts/main.json', stroke: 'TKPWRAOEUS', translation: 'sunrise' },
    ]);

    const prefixResponse = await engine.handleRequest({
      id: '5b',
      method: 'search_entries',
      params: {
        output: 'rise',
        match: 'prefix',
      },
    });
    expect(prefixResponse.result?.entries).toEqual([]);
    expect(prefixResponse.result?.match).toBe('prefix');

    const strokePrefixResponse = await engine.handleRequest({
      id: '5c',
      method: 'search_entries',
      params: {
        stroke: 'TKP',
        match: 'prefix',
      },
    });
    expect(strokePrefixResponse.result?.entries).toEqual([
      { dictionary: '/dicts/main.json', stroke: 'TKPWRAOEUS', translation: 'sunrise' },
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
