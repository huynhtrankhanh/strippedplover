# Stripped Plover Testing Report

## Test Environment
- Node.js Version: 22.11.0 (sqlite built-in **not available**)
- Platform: Linux
- Date: 2025-12-13

## Test Summary

| Test Category | Tests Run | Passed | Failed |
|--------------|-----------|--------|--------|
| Python dictionary unit tests | 9 | 9 | 0 |
| Engine Python import/export | 1 | 1 | 0 |
| STDIO end-to-end (Python dictionary) | 1 | 1 | 0 |
| SQLite-dependent suites | 0 | 0 | 0 (blocked: `node:sqlite` missing in current runtime) |
| **Total** | **11** | **11** | **0** |

## Detailed Results

### Python dictionary unit tests
- **Files:** `src/dictionary/python-dictionary.test.ts`
- **Focus:** Loading plover-style `.py` dictionaries, LONGEST_KEY validation, lookup/reverse lookup, enumeration for export, and read-only enforcement.
- **Result:** All 9 tests passed.

### Engine Python import/export
- **File:** `src/engine.python-import.test.ts`
- **Scenario:** Import dictionary data into a `.py` path via the protocol, export back, and translate using the loaded Python dictionary.
- **Result:** Passed; translations now emit expected preedit output after import.

### STDIO end-to-end (Python dictionary)
- **File:** `src/e2e/stdio.e2e.test.ts`
- **Scenario:** Built `dist/`, started the STDIO binary, imported a Python dictionary, translated a stroke, exported entries, and quit.
- **Result:** Passed; STDIO flow validated with protocol requests/responses.

## Notes
- The runtime used in this environment does **not** include the `node:sqlite` built-in module, so SQLite-backed dictionary suites were not executed here. They remain unchanged and should be rerun in an environment with `node:sqlite` available (Node.js ≥22.5 built with SQLite support).
