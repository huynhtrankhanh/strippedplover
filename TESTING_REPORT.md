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

### Bugs Found

1.  **`remove_dictionary` Path Normalization**: The `remove_dictionary` method in `src/engine.ts` performs an exact string match on the dictionary path. This fails if the input path has different separators or redundant slashes compared to the stored path, even if they refer to the same logical file.

    *   **Severity**: Medium. It can cause confusion if clients are not consistent with path strings.
    *   **Reproduction**: `src/reproduce_issue.test.ts`
    *   **Fix**: Normalize the path using `normalizeDictPath` before searching/filtering.

### Test Coverage Gaps

*   **Formatting Edge Cases**: Need more tests for complex formatting interactions (glue, capitalization, attachments).
*   **Dictionary Priorities**: Need to verify that `prioritize_dictionaries` works as expected.
*   **Solo Mode**: Need to verify `solo_dictionaries` and `end_solo_dictionaries` logic.

## Test Results

(To be populated)
