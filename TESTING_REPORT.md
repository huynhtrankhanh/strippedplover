# Stripped Plover Testing Report

## Test Environment
- Node.js Version: 22.21.0 (node:sqlite built-in **available**; using `/usr/bin/node`)
- Platform: Linux
- Date: 2025-12-14

## Test Summary

| Test Category | Tests Run | Passed | Failed |
|--------------|-----------|--------|--------|
| Python dictionary unit tests | 9 | 9 | 0 |
| Engine import/export (Python & JSON) | 2 | 2 | 0 |
| Dictionary management & macros (SQLite-backed) | 5 | 5 | 0 |
| STDIO end-to-end (JSON & Python) | 2 | 2 | 0 |
| **Total** | **18** | **18** | **0** |

## Detailed Results

### Python dictionary unit tests
- **Files:** `src/dictionary/python-dictionary.test.ts`
- **Focus:** Loading plover-style `.py` dictionaries, LONGEST_KEY validation, lookup/reverse lookup, enumeration for export, and read-only enforcement.
- **Result:** All 9 tests passed.

### Engine import/export (Python & JSON)
- **File:** `src/engine.python-import.test.ts`
- **Scenario:** Import dictionary data into Python and JSON dictionaries via the protocol, export back, and translate using the loaded dictionaries.
- **Result:** Both protocol flows passed; translations emit expected preedit output after import.

### Dictionary management & macros (SQLite-backed)
- **File:** `src/engine.dictionary.test.ts`
- **Focus:** Reordering, enabling/disabling, toggle specifications, and Plover macros (PRIORITY_DICT, TOGGLE_DICT, SOLO_DICT/END_SOLO_DICT) backed by SQLite storage.
- **Result:** All 5 tests passed with the experimental `node:sqlite` built-in available.

### STDIO end-to-end (JSON & Python)
- **File:** `src/e2e/stdio.e2e.test.ts`
- **Scenario:** Built `dist/`, started the STDIO binary, imported JSON and Python dictionaries, translated strokes, exported entries, and quit.
- **Result:** Both STDIO flows passed; protocol requests/responses validated.

## Notes
- Tests were executed with `npm test` (Vitest). The suite rebuilds TypeScript before STDIO end-to-end tests.
- `node:sqlite` availability is required for dictionary management and was provided by Node.js 22.21.0 (NodeSource build). Experimental warnings for SQLite and MaxListeners were observed but did not affect results.
