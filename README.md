# Stripped Plover

**A minimal STDIO-based stenography translation engine for IME integration.**

Stripped Plover is a streamlined version of [Plover](https://github.com/openstenoproject/plover) designed to run as a translation engine communicating via STDIO using a JSON line protocol. It is specifically designed for integration with Input Method Editors (IMEs).

## Features

- **No UI**: Runs as a headless translation engine
- **No keyboard capture**: Receives strokes via STDIO, doesn't capture keyboard
- **Minimal dependencies**: Only requires `plover-stroke` and `rtf_tokenize`
- **JSON line protocol**: Simple request/response protocol over STDIO
- **Preedit/Commit model**: Output designed for IME integration
- **Full dictionary support**: JSON and RTF dictionaries
- **Stateful translation**: Supports multi-stroke translations and undo

## Installation

```bash
pip install .
```

## Usage

```bash
stripped_plover
# or
python -m plover
```

The engine reads JSON requests from stdin and writes JSON responses to stdout.

### Example Session

```
$ stripped_plover
{"status": "ready"}
{"id": "1", "method": "add_dictionary", "params": {"path": "main.json"}}
{"id": "1", "result": {"status": "ok", "path": "main.json", "entries": 150000}}
{"id": "2", "method": "translate", "params": {"stroke": "TEFT"}}
{"id": "2", "result": {"preedit": " test", "key_combinations": []}}
{"id": "3", "method": "translate", "params": {"stroke": "-G"}}
{"id": "3", "result": {"preedit": " testing", "key_combinations": []}}
{"id": "4", "method": "commit", "params": {}}
{"id": "4", "result": {"committed": " testing"}}
{"id": "5", "method": "quit", "params": {}}
{"id": "5", "result": {"status": "ok"}}
```

## Protocol

See [PROTOCOL.md](PROTOCOL.md) for complete protocol documentation.

### Key Methods

| Method | Description |
|--------|-------------|
| `translate` | Translate a stroke, returns updated preedit |
| `commit` | Commit current preedit text |
| `reset_state` | Reset translation state |
| `add_dictionary` | Load a dictionary |
| `remove_dictionary` | Unload a dictionary |
| `lookup` | Look up a stroke |
| `reverse_lookup` | Find strokes for a translation |
| `quit` | Stop the engine |

## MANIFESTO

See [MANIFESTO.md](MANIFESTO.md) for the design principles behind Stripped Plover.

## Testing

See [TESTING_REPORT.md](TESTING_REPORT.md) for the comprehensive test results.

## License

Stripped Plover is GPLv2+ licensed. See [LICENSE.txt](LICENSE.txt) for details.

Based on [Plover](https://github.com/openstenoproject/plover) by the [Open Steno Project](http://opensteno.org).
