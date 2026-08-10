# Stripped Plover

**A minimal STDIO-based stenography translation engine for IME integration.**

Stripped Plover is a streamlined version of [Plover](https://github.com/openstenoproject/plover) designed to run as a translation engine communicating via STDIO using a JSON line protocol. It is specifically designed for integration with Input Method Editors (IMEs).

## Features

- **No UI**: Runs as a headless translation engine
- **No keyboard capture**: Receives strokes via STDIO, doesn't capture keyboard
- **No filesystem access**: All dictionaries are stored in SQLite and passed via protocol messages
- **SQLite-backed dictionaries**: Uses Node.js built-in SQLite for fast entry insertion and updates
- **JSON line protocol**: Simple request/response protocol over STDIO
- **Preedit/Commit model**: Output designed for IME integration
- **Import/Export**: Dictionary import/export via protocol messages
- **Stateful translation**: Supports multi-stroke translations and undo
- **Dictionary stack control**: RPCs and `{PLOVER:...}` commands (PRIORITY/TOGGLE/SOLO/END_SOLO) matching the `plover_dict_commands` syntax
- **Dictionary state events**: Emits STDOUT events when translations change dictionary state, keeping hosts in sync
- **Plover command events**: Emits STDOUT events for `{PLOVER:ADD_TRANSLATION}`, `{PLOVER:LOOKUP}`, and `{PLOVER:CONFIGURE}` so hosts can provide UI-driven dictionary actions
- **Entry search and enumeration APIs**: Paginated dictionary entry listing and filtering with configurable sorting
- **Sandboxed Python dictionaries**: Execute Python dictionary code in a WASM sandbox (without concrete entries)

## Dictionary Types

Stripped Plover supports two dictionary types:

- **JSON dictionaries**: Store explicit stroke-to-translation entries. Writable at runtime.
- **Python dictionaries**: Store Python code implementing `lookup()` function. Does not expose concrete entries.

The dictionary type must be explicitly declared when importing - it is NOT inferred from any file extension or path.

## Requirements

- Node.js 22.5.0 or later (uses built-in SQLite module)

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
npm start -- <database-path>
# or
node dist/index.js <database-path>
```

The application requires a database path as an argument. You can use `:memory:` for an in-memory database or provide a file path for persistence.

The engine reads JSON requests from stdin and writes JSON responses to stdout.

## Protocol

See [PROTOCOL.md](PROTOCOL.md) for complete protocol documentation.

### Key Methods

| Method | Description |
|--------|-------------|
| `translate` | Translate a stroke, returns updated preedit |
| `reset_state` | Reset translation state |
| `import_dictionary` | Import a dictionary (JSON entries or Python code) |
| `export_dictionary` | Export a dictionary (JSON entries or Python code) |
| `remove_dictionary` | Unload a dictionary |
| `prioritize_dictionaries` | Move selected dictionaries to the top of the stack |
| `set_dictionary_enabled` | Enable or disable a specific dictionary |
| `toggle_dictionaries` | Apply multiple enable/disable toggles using `+`, `-`, `!` prefixes |
| `solo_dictionaries` / `end_solo_dictionaries` | Enter/exit temporary solo mode for dictionaries |
| `get_dictionary_state` | Return full dictionary stack state (order, enabled, entries, solo flag) |
| `enumerate_entries` | List entries with pagination and sorting |
| `search_entries` | Search entries by stroke and/or output with pagination and sorting |
| `lookup` | Look up a stroke |
| `reverse_lookup` | Find strokes for a translation |
| `quit` | Stop the engine |

### Import/Export

Dictionaries can be imported and exported via protocol messages with explicit type declaration:

```json
// Import a JSON dictionary (explicit entries)
{"id": "1", "method": "import_dictionary", "params": {"name": "my-dict", "type": "json", "data": {"TEFT": "test"}}}

// Import a Python dictionary (literal Python code)
{"id": "2", "method": "import_dictionary", "params": {"name": "my-py-dict", "type": "python", "pythonCode": "LONGEST_KEY = 1\n\ndef lookup(key):\n    ..."}}

// Export a JSON dictionary
{"id": "3", "method": "export_dictionary", "params": {"name": "my-dict"}}
// Response: {"result": {"type": "json", "data": {"TEFT": "test"}, ...}}

// Export a Python dictionary
{"id": "4", "method": "export_dictionary", "params": {"name": "my-py-dict"}}
// Response: {"result": {"type": "python", "pythonCode": "...", ...}}
```

## MANIFESTO

See [MANIFESTO.md](MANIFESTO.md) for the design principles behind Stripped Plover.

## License

Stripped Plover is GPLv2+ licensed. See [LICENSE.txt](LICENSE.txt) for details.

Based on [Plover](https://github.com/openstenoproject/plover) by the [Open Steno Project](http://opensteno.org).
