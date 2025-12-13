import { readFileSync } from 'node:fs';
import { StenoDictionaryLike } from './steno-dictionary.js';
// Use vendored python-wasm with sandboxed POSIX operations
import { asyncPython, PythonWasmAsync } from '../../vendor/python-wasm/dist/node.js';

type PythonRuntime = PythonWasmAsync;

/**
 * Python Dictionary implementation compatible with plover-python-dictionary format.
 * 
 * The plover-python-dictionary format expects:
 * - LONGEST_KEY: int - Maximum number of strokes in any entry
 * - lookup(key: tuple[str, ...]) -> str - Function that returns translation or raises KeyError
 * - reverse_lookup(value: str) -> list[tuple[str, ...]] - Optional function for reverse lookup
 * 
 * We use asyncPython for non-blocking lookups.
 */
export class PythonDictionary implements StenoDictionaryLike {
  private _path: string;
  private _py: PythonRuntime | null = null;
  private _longestKey = 0;
  private _hasReverseLookup = false;
  readonly = true;
  enabled: boolean;

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
    // Use python-wasm (CPython) with full filesystem for proper stdlib support
    const py: PythonRuntime = await asyncPython({
      fs: 'everything',
    });

    // Set up sandboxing to block dangerous modules and add helper functions
    await py.exec(
      [
        'import sys, builtins',
        'class __SpBlocker:',
        "    def find_spec(self, fullname, path=None, target=None):",
        "        if fullname in ('js', '_js') or fullname.startswith('js.'):",
        "            raise ImportError('js disabled')",
        "        if fullname in ('subprocess', 'socket', 'http', 'urllib', 'ftplib', 'smtplib', 'telnetlib'):",
        "            raise ImportError('restricted module')",
        "        return None",
        'sys.meta_path.insert(0, __SpBlocker())',
        'for mod in ("js","_js","subprocess","socket"):',
        '    sys.modules.pop(mod, None)',
      ].join('\n')
    );

    // Load the dictionary module content
    const content = readFileSync(path, 'utf-8');
    await py.exec(content);

    // Add safe lookup helper function
    await py.exec(`
def __safe_lookup(key):
    try:
        return lookup(key)
    except KeyError:
        return None
    except Exception:
        return None

def __safe_reverse_lookup(value):
    try:
        if 'reverse_lookup' in globals():
            return list(reverse_lookup(value))
        return []
    except Exception:
        return []
`);

    // Validate LONGEST_KEY exists and is valid
    const hasLongestKey = await py.repr("'LONGEST_KEY' in dir()");
    if (hasLongestKey.trim() !== 'True') {
      throw new Error('Invalid or missing LONGEST_KEY in python dictionary');
    }
    const longestRaw = await py.repr('int(LONGEST_KEY)');
    const pythonLongest = Number.parseInt(String(longestRaw).replace(/[^0-9-]/g, ''), 10);
    if (!Number.isFinite(pythonLongest) || pythonLongest <= 0) {
      throw new Error('Invalid or missing LONGEST_KEY in python dictionary');
    }
    this._longestKey = pythonLongest;

    // Validate lookup function exists
    const hasLookup = await py.repr('callable(lookup) if "lookup" in dir() else False');
    if (hasLookup.trim() !== 'True') {
      throw new Error('Missing or invalid `lookup` function in python dictionary');
    }

    // Check if reverse_lookup function exists
    const hasReverse = await py.repr('callable(reverse_lookup) if "reverse_lookup" in dir() else False');
    this._hasReverseLookup = hasReverse.trim() === 'True';

    // Keep the Python runtime alive for lookups
    this._py = py;
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

  /**
   * For Python dictionaries with dynamic lookup, we don't know the length.
   * Return -1 to indicate unknown size.
   */
  get length(): number {
    return -1;
  }

  /**
   * Async lookup that calls the Python lookup function.
   */
  async get(strokeTuple: string[]): Promise<string | null> {
    if (!this._py) {
      return null;
    }
    if (strokeTuple.length > this._longestKey) {
      return null;
    }

    try {
      // Build Python tuple from stroke array - escape backslashes first, then single quotes
      const tupleStr = `(${strokeTuple.map(s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(', ')}${strokeTuple.length === 1 ? ',' : ''})`;
      
      const result = await this._py.repr(`__safe_lookup(${tupleStr})`);
      
      const trimmed = result.trim();
      if (trimmed && trimmed !== 'None') {
        // Remove surrounding quotes if present
        if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
          return trimmed.slice(1, -1);
        }
        return trimmed;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Async check if stroke tuple exists in dictionary.
   */
  async has(strokeTuple: string[]): Promise<boolean> {
    const result = await this.get(strokeTuple);
    return result !== null;
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

  /**
   * For Python dictionaries with dynamic lookup, we cannot iterate entries.
   */
  *entries(): Generator<[string[], string]> {
    // Cannot enumerate entries for dynamic Python dictionaries
  }

  items(): Array<[string[], string]> {
    return [...this.entries()];
  }

  /**
   * Async reverse lookup that calls the Python reverse_lookup function if available.
   */
  async reverseLookup(translation: string): Promise<Set<string[]>> {
    if (!this._py || !this._hasReverseLookup) {
      return new Set();
    }

    try {
      const escapedTranslation = translation.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      
      // Use exec to set up the result, then repr to get it
      await this._py.exec(`import json; __reverse_result = json.dumps([list(s) for s in __safe_reverse_lookup('${escapedTranslation}')])`);
      const result = await this._py.repr('__reverse_result');

      const trimmed = result.trim();
      if (trimmed && trimmed !== "'[]'" && trimmed !== '[]') {
        try {
          const parsed = JSON.parse(trimmed.replace(/^'|'$/g, ''));
          if (Array.isArray(parsed)) {
            return new Set(parsed.filter(Array.isArray));
          }
        } catch {
          // ignore parse errors
        }
      }
      return new Set();
    } catch {
      return new Set();
    }
  }

  caseReverseLookup(_translation: string): Set<string> {
    // Not supported for dynamic Python dictionaries
    return new Set();
  }

  /**
   * Terminate the Python runtime when done.
   */
  terminate(): void {
    if (this._py) {
      this._py.terminate();
      this._py = null;
    }
  }
}
