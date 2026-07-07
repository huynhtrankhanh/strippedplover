import { describe, expect, it } from 'vitest';
import { StrippedPlover } from './engine.js';

function makeEntry(index: number): [string, string] {
  const padded = index.toString().padStart(7, '0');
  return [`ST/!${padded}`, `word-${padded}-${index % 100 === 0 ? 'needle' : 'plain'}-${index % 17}`];
}

async function createEngine(count: number): Promise<StrippedPlover> {
  const engine = new StrippedPlover(':memory:');
  const response = await engine.handleRequest({
    id: 'import',
    method: 'import_dictionary',
    params: {
      name: '/dicts/stress.json',
      type: 'json',
      data: {},
    },
  });
  expect(response.error).toBeUndefined();

  const db = (engine as unknown as { db: import('./sqlite-database.js').DatabaseSync }).db;
  const insert = db.prepare('INSERT INTO entries (dictionary, stroke, translation) VALUES (?, ?, ?)');
  db.exec('BEGIN TRANSACTION');
  try {
    for (let i = 0; i < count; i++) {
      const [stroke, translation] = makeEntry(i);
      insert.run('/dicts/stress.json', stroke, translation);
      if (i > 0 && i % 50_000 === 0) {
        db.exec('COMMIT');
        await new Promise(resolve => setImmediate(resolve));
        db.exec('BEGIN TRANSACTION');
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return engine;
}

async function expectFast<T>(label: string, budgetMs: number, run: () => Promise<T> | T): Promise<T> {
  const started = performance.now();
  const result = await run();
  const elapsed = performance.now() - started;
  expect(elapsed, `${label} took ${elapsed.toFixed(1)}ms`).toBeLessThan(budgetMs);
  return result;
}

describe('entry search performance smoke tests', () => {
  it('keeps API pagination and exposed query patterns bounded on a large dictionary', async () => {
    const engine = await createEngine(100_000);

    const page = await expectFast('alphabetic page 50', 250, () => engine.handleRequest({
      id: 'page',
      method: 'enumerate_entries',
      params: { page: 50, page_size: 100, sort: 'alphabetic' },
    }));
    expect(page.error).toBeUndefined();
    expect(page.result?.entries).toHaveLength(100);
    expect(page.result?.total).toBe(100_000);

    const prefix = await expectFast('stroke prefix search', 250, () => engine.handleRequest({
      id: 'prefix',
      method: 'search_entries',
      params: { stroke: 'ST/!00012', match: 'prefix', page_size: 25, sort: 'alphabetic' },
    }));
    expect(prefix.error).toBeUndefined();
    expect(prefix.result?.entries).toHaveLength(25);

    const substring = await expectFast('output substring search', 500, () => engine.handleRequest({
      id: 'substring',
      method: 'search_entries',
      params: { output: 'needle', match: 'substring', page: 2, page_size: 50, sort: 'alphabetic' },
    }));
    expect(substring.error).toBeUndefined();
    expect(substring.result?.entries).toHaveLength(50);
  }, 30_000);
});

describe.runIf(process.env.RUN_MILLION_ENTRY_STRESS === '1')('million-entry API stress tests', () => {
  it('handles 1,000,000 entries across pagination, prefix, and substring query APIs', async () => {
    const engine = await createEngine(1_000_000);

    await expectFast('1m alphabetic page 1000', 500, async () => {
      const response = await engine.handleRequest({
        id: 'million-page',
        method: 'enumerate_entries',
        params: { page: 1000, page_size: 100, sort: 'alphabetic' },
      });
      expect(response.error).toBeUndefined();
      expect(response.result?.entries).toHaveLength(100);
      expect(response.result?.total).toBe(1_000_000);
    });

    await expectFast('1m stroke prefix search', 500, async () => {
      const response = await engine.handleRequest({
        id: 'million-prefix',
        method: 'search_entries',
        params: { stroke: 'ST/!09999', match: 'prefix', page_size: 100, sort: 'alphabetic' },
      });
      expect(response.error).toBeUndefined();
      expect(response.result?.entries).toHaveLength(100);
    });

    await expectFast('1m output substring search', 1000, async () => {
      const response = await engine.handleRequest({
        id: 'million-substring',
        method: 'search_entries',
        params: { output: 'needle', match: 'substring', page: 10, page_size: 100, sort: 'alphabetic' },
      });
      expect(response.error).toBeUndefined();
      expect(response.result?.entries).toHaveLength(100);
    });
  }, 120_000);
});
