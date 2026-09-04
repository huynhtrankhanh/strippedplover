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
 * Python dictionaries store the Python code directly (no filesystem access).
 * The code is executed in a sandboxed WASM Python runtime.
 */
export class PythonDictionary implements StenoDictionaryLike {
  readonly type = 'python' as const;
  private _identifier: string;
  private _pythonCode: string;
  private _py: PythonRuntime | null = null;
  private _longestKey = 0;
  private _hasReverseLookup = false;
  enabled: boolean;

  private constructor(name: string, pythonCode: string, enabled = true) {
    this._identifier = name;
    this._pythonCode = pythonCode;
    this.enabled = enabled;
  }

  /**
   * Load a Python dictionary from code string.
   * This is the primary way to create Python dictionaries - no filesystem access.
   */
  static async loadFromCode(name: string, pythonCode: string): Promise<PythonDictionary> {
    const dict = new PythonDictionary(name, pythonCode);
    await dict.initializePython(pythonCode);
    return dict;
  }

  /**
   * Get the Python code for this dictionary.
   * Used for export and serialization.
   */
  get pythonCode(): string {
    return this._pythonCode;
  }

  private async initializePython(pythonCode: string): Promise<void> {
    // Load CPython and its standard library into a private in-memory filesystem.
    // The vendored Node adapter deliberately does not add a native filesystem
    // mount, and stdio is omitted so dictionary code has no ambient host handles.
    const py: PythonRuntime = await asyncPython({
      fs: 'everything',
      noStdio: true,
    });

    try {
      // SECURITY NOTE: Sandboxing is enforced at the WASM/JS layer in vendor/@cowasm/kernel
      // by removing native filesystem, stdio, child_process, and POSIX process bindings.
      // Python module blocking is NOT used because it can be bypassed.

      // Execute the Python code directly
      await py.exec(pythonCode);

      // Add safe lookup helper function
      await py.exec(`
def __safe_lookup(key):
    try:
        return lookup(key)
    except KeyError:
        return None
    except Exception:
        return None

def __safe_lookup_base64(key):
    value = __safe_lookup(key)
    if not isinstance(value, str):
        return None
    import base64
    return base64.b64encode(value.encode('utf-8')).decode('ascii')

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
    } catch (error) {
      // Ownership transfers to the dictionary only at the `_py` assignment.
      // Until then, initialization is responsible for destroying the runtime.
      py.terminate();
      throw error;
    }
  }

  get identifier(): string {
    return this._identifier;
  }

  set identifier(value: string) {
    this._identifier = value;
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
      
      // `repr()` is the only value-returning API exposed by python-wasm, but a
      // Python string repr escapes newlines, backslashes, and invisible Unicode
      // characters such as ZWJ. Transfer UTF-8 as base64 so the repr contains
      // ASCII only, then decode the original string on this side of the bridge.
      const result = await this._py.repr(`__safe_lookup_base64(${tupleStr})`);
      
      const trimmed = result.trim();
      if (trimmed !== 'None' &&
          ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
           (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
        const encoded = trimmed.slice(1, -1);
        return Buffer.from(encoded, 'base64').toString('utf8');
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
        } catch (err) {
          console.error('Error parsing reverse lookup result:', err);
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
