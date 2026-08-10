# Testing Report

## Code Review

### Core Logic (`src/engine.ts`, `src/translation.ts`, etc.)

The core logic seems to follow the Plover algorithm closely.
*   **Engine**: Acts as a controller, dispatching requests and managing state.
*   **Translation**: Handles the stateful translation process, including undo/redo logic.
*   **Formatting**: Handles text formatting, including spacing, capitalization, and meta commands.
*   **Strokes**: Handles steno stroke parsing and normalization.

### Dictionary Handling

*   **JSON Dictionaries**: Backed by SQLite. This is efficient for lookups and updates.
*   **Python Dictionaries**: Executed in a WASM sandbox. This allows for safe execution of user code.

### Protocol

The JSON-RPC-like protocol over STDIO is simple and effective.

### Observations

1.  **Dictionary Path Handling**: The `remove_dictionary` method performs an exact string match on the dictionary path (identifier). This is by design, as paths are treated as unique identifiers. Clients must ensure they use the exact same string to remove a dictionary as they used to import it.

### Test Coverage Gaps & Improvements

New comprehensive tests were added in `src/engine.comprehensive.test.ts` covering:
*   **Formatting**: Tested capitalization, glue, and attachment behavior. Confirmed that `attach` (suppress space) and `glue` work as intended.
*   **Dictionary Priorities**: Verified that `prioritize_dictionaries` correctly changes translation results based on dictionary order.
*   **Dictionary Management**: Verified `set_dictionary_enabled` and `remove_dictionary`.
*   **Solo Mode**: Verified `solo_dictionaries` and `end_solo_dictionaries` correctly isolate and restore dictionary states.
*   **CRUD**: Verified conflict-aware `add_entry_safely`, `replace_entry`, and `remove_entry`.
*   **Python Dictionaries**: Verified that Python dictionaries can be imported and used for translation.

## Test Results

All existing and new tests passed.

*   `src/engine.dictionary.test.ts`: Passed.
*   `src/engine.python-import.test.ts`: Passed.
*   `src/e2e/stdio.e2e.test.ts`: Passed.
*   `src/dictionary/python-dictionary.test.ts`: Passed.
*   `src/engine.comprehensive.test.ts`: Passed (8 tests).

The codebase seems robust.
