# Stripped Plover

**A minimal STDIO-based stenography translation engine for IME integration.**

Stripped Plover is a streamlined version of [Plover](https://github.com/openstenoproject/plover) designed to run as a translation engine communicating via STDIO using a JSON line protocol. It is specifically designed for integration with Input Method Editors (IMEs).

## Features

- **No UI**: Runs as a headless translation engine
- **No keyboard capture**: Receives strokes via STDIO, doesn't capture keyboard
- **No external dependencies**: Pure TypeScript/Node.js implementation
- **SQLite-backed dictionaries**: Uses Node.js built-in SQLite for fast entry insertion and updates
- **JSON line protocol**: Simple request/response protocol over STDIO
- **Preedit/Commit model**: Output designed for IME integration
- **Import/Export**: Dictionary import/export via protocol messages
- **Stateful translation**: Supports multi-stroke translations and undo
- **Dictionary stack control**: RPCs and `{PLOVER:...}` commands (PRIORITY/TOGGLE/SOLO/END_SOLO) matching the `plover_dict_commands` syntax
 - **Sandboxed Python dictionaries**: Load `.py` plover dictionaries in a WASM sandbox (read-only at runtime; import/export supported)

## Requirements

- Node.js 22.5.0 or later (uses built-in SQLite module)

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
npm start
# or
node dist/index.js
```

The engine reads JSON requests from stdin and writes JSON responses to stdout.

## Protocol

See [PROTOCOL.md](PROTOCOL.md) for complete protocol documentation.

### Key Methods

| Method | Description |
|--------|-------------|
| `translate` | Translate a stroke, returns updated preedit |
| `reset_state` | Reset translation state |
| `add_dictionary` | Register a SQLite-backed dictionary (Python dictionaries require a `code` field) |
| `remove_dictionary` | Unload a dictionary |
| `prioritize_dictionaries` | Move selected dictionaries to the top of the stack |
| `set_dictionary_enabled` | Enable or disable a specific dictionary |
| `toggle_dictionaries` | Apply multiple enable/disable toggles using `+`, `-`, `!` prefixes |
| `solo_dictionaries` / `end_solo_dictionaries` | Enter/exit temporary solo mode for dictionaries |
| `import_dictionary` | Import dictionary entries from protocol message |
| `export_dictionary` | Export dictionary entries to protocol message |
| `lookup` | Look up a stroke |
| `reverse_lookup` | Find strokes for a translation |
| `quit` | Stop the engine |

### Import/Export

Dictionaries can be imported and exported via protocol messages:

```json
// Import a dictionary
{"id": "1", "method": "import_dictionary", "params": {"path": "my.json", "data": {"TEFT": "test"}}}

// Export a dictionary
{"id": "2", "method": "export_dictionary", "params": {"path": "my.json"}}
// Response includes: {"result": {"data": {"TEFT": "test"}, ...}}

// Python dictionaries are stored alongside JSON dictionaries inside SQLite. Provide Python code directly when adding:
{"id": "3", "method": "add_dictionary", "params": {"path": "custom.py", "format": "python", "code": "LONGEST_KEY = 1\nDICTIONARY = {('TEFT',): 'test'}\n\ndef lookup(key):\n    if key in DICTIONARY:\n        return DICTIONARY[key]\n    raise KeyError(key)\n"}}

// Import/export still works with data; Python code is generated internally:
{"id": "4", "method": "import_dictionary", "params": {"path": "custom.py", "data": {"TEFT": "test"}}}
{"id": "5", "method": "export_dictionary", "params": {"path": "custom.py"}}
```

## MANIFESTO

See [MANIFESTO.md](MANIFESTO.md) for the design principles behind Stripped Plover.

## License

Stripped Plover is GPLv2+ licensed. See [LICENSE.txt](LICENSE.txt) for details.

Based on [Plover](https://github.com/openstenoproject/plover) by the [Open Steno Project](http://opensteno.org).
