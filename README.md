# Stripped Plover (Rust)

A minimal, secure, and fast stenography translation engine for IME integration, rewritten in Rust.

## Features

- **STDIO JSON Protocol**: Communicates via standard input/output using JSON lines.
- **SQLite Storage**: Efficiently stores dictionary data.
- **WASM-Sandboxed Python**: Supports Python dictionaries securely using `rustpython` compiled to WASM.
- **Full Plover Formatting**: Supports case modes, spacing, attachment, and meta commands.

## Architecture

- **Engine**: Orchestrates translation, formatting, and dictionary management.
- **Translator**: Converts steno strokes to text using longest-match algorithm.
- **Formatter**: Applies spacing, capitalization, and other text formatting rules.
- **Python Runner (WASM)**: A separate WASM module that executes Python dictionary code safely.

## Build

```bash
# Build the Python Runner WASM module (required)
cd python-runner
cargo build --target wasm32-wasip1 --release
cd ..

# Copy WASM to assets
mkdir -p assets
cp python-runner/target/wasm32-wasip1/release/python_runner.wasm assets/

# Build the main engine
cargo build --release
```

## Usage

Run the binary:

```bash
./target/release/rust-strippedplover
```

Send JSON requests via stdin. See protocol documentation for details.

## Protocol

(Same as original Stripped Plover protocol)
