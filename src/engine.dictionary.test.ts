import { describe, expect, it } from 'vitest';
import { StrippedPlover } from './engine.js';
import { StenoDictionary } from './dictionary/index.js';

function createEngine(identifiers: string[]): StrippedPlover {
  const engine = new StrippedPlover(':memory:');

  // We need to use createJsonDictionary or similar to get proper DB injection
  // Or hack it by getting the db from engine
  const db = (engine as any).db;

  const dicts = identifiers.map(identifier => {
    const dict = new StenoDictionary(db, { identifier });
    // In real app, we would update DB. But for this unit test helper,
    // we just want to set the in-memory collection state?
    // Wait, the new engine relies on DB state for some operations (like persistence).
    // But StenoDictionaryCollection is in memory.
    // The RPC handlers update DB.

    // We should populate the DB too for consistency if we want full testing.
    // Insert into dictionaries table
    const stmt = db.prepare('INSERT OR IGNORE INTO dictionaries (name, type, enabled, priority) VALUES (?, ?, ?, ?)');
    stmt.run(identifier, 'json', 1, 0);

    return dict;
  });
  (engine as any).dictionaries.setDicts(dicts);
  return engine;
}

function getOrder(engine: StrippedPlover): string[] {
  return ((engine as any).dictionaries.dicts as StenoDictionary[]).map(d => d.identifier);
}

function getEnabled(engine: StrippedPlover): Record<string, boolean> {
  const dicts = ((engine as any).dictionaries.dicts as StenoDictionary[]);
  const result: Record<string, boolean> = {};
  for (const d of dicts) {
    result[d.identifier] = d.enabled;
  }
  return result;
}

describe('dictionary management RPC methods', () => {
  it('reorders dictionaries with prioritize_dictionaries', async () => {
    const engine = createEngine(['main.json', 'user.json', 'commands.json']);

    await engine.handleRequest({
      id: 1,
      method: 'prioritize_dictionaries',
      params: { identifiers: ['commands.json', 'user.json'] },
    });

    expect(getOrder(engine)).toEqual(['commands.json', 'user.json', 'main.json']);
  });

  it('enables and disables dictionaries explicitly', async () => {
    const engine = createEngine(['main.json', 'user.json']);

    await engine.handleRequest({
      id: 1,
      method: 'set_dictionary_enabled',
      params: { identifier: 'user.json', enabled: false },
    });
    expect(getEnabled(engine)).toMatchObject({ 'main.json': true, 'user.json': false });

    await engine.handleRequest({
      id: 2,
      method: 'set_dictionary_enabled',
      params: { identifier: 'user.json', enabled: true },
    });
    expect(getEnabled(engine)).toMatchObject({ 'main.json': true, 'user.json': true });
  });

  it('applies toggle specifications with toggle_dictionaries', async () => {
    const engine = createEngine(['dicts/main.json', 'dicts/user.json', 'dicts/commands.json']);

    await engine.handleRequest({
      id: 1,
      method: 'toggle_dictionaries',
      params: { toggles: ['-user.json', '!commands.json'] },
    });

    expect(getEnabled(engine)).toMatchObject({
      'dicts/main.json': true,
      'dicts/user.json': false,
      'dicts/commands.json': false,
    });
  });
});

describe('plover dictionary commands', () => {
  it('supports PRIORITY_DICT and TOGGLE_DICT macros', async () => {
    const engine = createEngine(['a/main.json', 'b/user.json', 'c/commands.json']);

    engine.handleEngineCommand('PRIORITY_DICT:user.json');
    expect(getOrder(engine)).toEqual(['b/user.json', 'a/main.json', 'c/commands.json']);

    engine.handleEngineCommand('TOGGLE_DICT:-commands.json');
    expect(getEnabled(engine)).toMatchObject({
      'a/main.json': true,
      'b/user.json': true,
      'c/commands.json': false,
    });
  });

  it('emits events only for host-handled commands', () => {
    const engine = createEngine(['main.json']);
    const events: Record<string, unknown>[] = [];
    (engine as any).eventSink = (event: Record<string, unknown>) => events.push(event);

    engine.handleEngineCommand('ADD_TRANSLATION:TPH/TEFT:test');
    engine.handleEngineCommand('LOOKUP:test');
    engine.handleEngineCommand('CONFIGURE:machine');
    engine.handleEngineCommand('UNKNOWN:test');
    engine.handleEngineCommand('TOGGLE');

    expect(events).toEqual([
      { event: 'plover:add_translation', command: 'add_translation', argument: 'TPH/TEFT:test' },
      { event: 'plover:lookup', command: 'lookup', argument: 'test' },
      { event: 'plover:configure', command: 'configure', argument: 'machine' },
    ]);
  });

  it('supports SOLO_DICT and restores with END_SOLO_DICT', async () => {
    const engine = createEngine(['main.json', 'user.json', 'commands.json']);

    engine.handleEngineCommand('SOLO_DICT:+commands.json');
    expect(getEnabled(engine)).toEqual({
      'main.json': false,
      'user.json': false,
      'commands.json': true,
    });

    engine.handleEngineCommand('TOGGLE_DICT:!commands.json');
    expect(getEnabled(engine)).toEqual({
      'main.json': false,
      'user.json': false,
      'commands.json': false,
    });

    engine.handleEngineCommand('END_SOLO_DICT');
    expect(getEnabled(engine)).toEqual({
      'main.json': true,
      'user.json': true,
      'commands.json': true,
    });
  });
});
