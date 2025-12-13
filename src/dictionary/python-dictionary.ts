import { readFileSync } from 'node:fs';
import { StenoDictionaryLike } from './steno-dictionary.js';

const MICROPY_HEAP_SIZE = 64 * 1024;

type MicroPythonModule = {
  init: (heapSize: number) => void;
  do_str: (code: string) => Promise<string> | string;
};

async function resolveMicropython(): Promise<MicroPythonModule> {
  const raw = await (require('micropython') as Promise<MicroPythonModule> | MicroPythonModule);
  return (raw as any).then ? await (raw as Promise<MicroPythonModule>) : (raw as MicroPythonModule);
}

function ensureArray(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
    return value as string[];
  }
  return null;
}

export class PythonDictionary implements StenoDictionaryLike {
  private entriesMap: Map<string, string> = new Map();
  private _path: string;
  readonly = true;
  enabled: boolean;
  private _longestKey = 0;

  private constructor(path: string, enabled = true) {
    this._path = path;
    this.enabled = enabled;
  }

  static async load(path: string): Promise<PythonDictionary> {
    const dict = new PythonDictionary(path);
    await dict.loadFromPython(path);
    return dict;
  }

  private async loadFromPython(path: string): Promise<void> {
    // Load micropython in a minimal sandbox: no JS bridge, no host FS exposure.
    const mp = await resolveMicropython();
    mp.init(MICROPY_HEAP_SIZE);
    await mp.do_str(
      [
        'import sys, builtins',
        "sys.modules.pop('js', None)",
        "sys.modules.pop('os', None)",
        "sys.modules.pop('subprocess', None)",
        'class __SpBlocker:',
        "    def find_spec(self, fullname, path=None, target=None):",
        "        if fullname == 'js':",
        "            raise ImportError('js disabled')",
        "        return None",
        'sys.meta_path.insert(0, __SpBlocker())',
        'def __sp_blocked(*args, **kwargs):',
        "    raise RuntimeError('unsupported in sandbox')",
        'builtins.open = __sp_blocked',
        'try:',
        '    import js',
        '    raise RuntimeError("js module should not be available")',
        'except Exception:',
        '    pass',
      ].join('\n')
    );

    const content = readFileSync(path, 'utf-8');
    await mp.do_str(content);

    // Collect longest key
    const longestRaw = await mp.do_str('print(int(LONGEST_KEY))');
    const pythonLongest = Number.parseInt(String(longestRaw).trim(), 10);
    if (!Number.isFinite(pythonLongest) || pythonLongest <= 0) {
      throw new Error('Invalid or missing LONGEST_KEY in python dictionary');
    }
    this._longestKey = pythonLongest;

    // Collect entries (best-effort) into JSON for synchronous lookup
    const entriesRaw = await mp.do_str(`
import json
def __sp_collect_entries():
    merged = {}
    for name in ('ENTRIES', 'DICTIONARY', 'dictionary', 'DICT'):
        obj = globals().get(name)
        if isinstance(obj, dict):
            try:
                merged.update(obj)
            except Exception:
                pass
    if not merged and 'entries' in globals() and callable(entries):
        try:
            for k, v in entries():
                merged[k] = v
        except Exception:
            pass
    result = []
    for k, v in merged.items():
        try:
            result.append([list(k), v])
        except Exception:
            pass
    print(json.dumps(result))
__sp_collect_entries()
`);

    let parsed: unknown = [];
    try {
      parsed = JSON.parse(String(entriesRaw).trim());
    } catch {
      parsed = [];
    }

    if (!Array.isArray(parsed)) {
      parsed = [];
    }

    for (const entry of parsed as unknown[]) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const key = ensureArray(entry[0]);
      const value = entry[1];
      if (!key || typeof value !== 'string') continue;
      const normalizedKey = key.join('/');
      this.entriesMap.set(normalizedKey, value);
      if (key.length > this._longestKey) {
        this._longestKey = key.length;
      }
    }
  }

  get path(): string {
    return this._path;
  }

  set path(value: string) {
    this._path = value;
  }

  get longestKey(): number {
    return this._longestKey;
  }

  get length(): number {
    return this.entriesMap.size;
  }

  get(strokeTuple: string[]): string | null {
    const key = strokeTuple.join('/');
    return this.entriesMap.get(key) ?? null;
  }

  has(strokeTuple: string[]): boolean {
    return this.get(strokeTuple) !== null;
  }

  set(_strokeTuple: string[], _translation: string): void {
    throw new Error('Unsupported operation: Python dictionary is read-only');
  }

  delete(_strokeTuple: string[]): boolean {
    throw new Error('Unsupported operation: Python dictionary is read-only');
  }

  clear(): void {
    throw new Error('Unsupported operation: Python dictionary is read-only');
  }

  update(_entries: Iterable<[string[], string]>): void {
    throw new Error('Unsupported operation: Python dictionary is read-only');
  }

  *entries(): Generator<[string[], string]> {
    for (const [key, value] of this.entriesMap.entries()) {
      yield [key.split('/'), value];
    }
  }

  items(): Array<[string[], string]> {
    return [...this.entries()];
  }

  reverseLookup(translation: string): Set<string[]> {
    const result: string[][] = [];
    const seen = new Set<string>();
    for (const [key, value] of this.entriesMap.entries()) {
      if (value === translation) {
        const tuple = key.split('/');
        const signature = tuple.join('/');
        if (!seen.has(signature)) {
          seen.add(signature);
          result.push(tuple);
        }
      }
    }
    return new Set(result);
  }

  caseReverseLookup(translation: string): Set<string> {
    const lower = translation.toLowerCase();
    const matches = new Set<string>();
    for (const value of this.entriesMap.values()) {
      if (value.toLowerCase() === lower) {
        matches.add(value);
      }
    }
    return matches;
  }
}
