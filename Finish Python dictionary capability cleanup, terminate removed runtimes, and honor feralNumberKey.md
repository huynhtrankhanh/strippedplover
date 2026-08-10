# Finish Python dictionary capability cleanup, terminate removed runtimes, and honor `feralNumberKey`

## Summary

PR #47 fixes the two original issues:

- numeric RTFCRE emitted by `Stroke.rtfcre` now round-trips through `Stroke.fromSteno()`;
- the generic `readonly` dictionary abstraction is removed and dictionary representation is exposed explicitly as `type: "json" | "python"`.

However, the cleanup exposes several remaining inconsistencies:

1. removing a Python dictionary does not terminate its WASM Python runtime;
2. `strokeFromSteno()` does not actually honor the configured `feralNumberKey` behavior;
3. `PythonDictionary` still contains special support for a global `DICTIONARY = {...}` object, including pseudo-enumeration of its contents.

The third behavior should be removed entirely.

Python dictionaries should have one coherent model:

```text
Python source
    ↓
LONGEST_KEY
lookup(key)
optional reverse_lookup(value)
```

They do **not** expose concrete dictionary entries.

A Python source file may internally use any Python objects it wants, including a variable named `DICTIONARY`, but Stripped Plover must not detect that name or give it any special host-side meaning.

---

## Bug 1: `remove_dictionary` does not terminate a Python dictionary runtime

`PythonDictionary` owns a live WASM Python runtime and provides an explicit:

```ts
terminate(): void
```

which calls the runtime's termination method and clears `_py`.

This is already treated as necessary when replacing an existing Python dictionary during `import_dictionary`: the previous `PythonDictionary` is explicitly terminated before the replacement is installed.

However, `remove_dictionary` currently only removes the dictionary object from the collection and deletes its database record.

Conceptually:

```ts
const dicts = this.dictionaries.dicts.filter(
    d => d.identifier !== name
);

this.dictionaries.setDicts(dicts);

DELETE FROM dictionaries WHERE name = ?
```

It does not call:

```ts
pythonDictionary.terminate()
```

before dropping the dictionary.

### Why this is wrong

Dictionary lifetime and runtime lifetime should be the same.

A removed Python dictionary is no longer usable by the engine, so its private Python runtime should be deterministically destroyed at that point.

Relying on JavaScript garbage collection for an object wrapping a WASM/CPython runtime is not an adequate lifecycle policy, especially when the class already exposes explicit termination.

The current behavior is also internally inconsistent:

```text
replace Python dictionary
    → terminate old runtime

remove Python dictionary
    → do not terminate old runtime
```

### Expected behavior

Before removing a dictionary:

```ts
const dictionary = this.dictionaries.get(name);

if (dictionary instanceof PythonDictionary) {
    dictionary.terminate();
}
```

Then remove it from the collection and persistence layer.

The exact implementation can differ, but the invariant should be:

```text
PythonDictionary leaves active dictionary collection
    ↓
its Python runtime is deterministically terminated
```

### Testing

Add a regression test that:

1. imports a Python dictionary;
2. verifies its runtime is active;
3. calls `remove_dictionary`;
4. verifies `terminate()` was invoked exactly once;
5. verifies the dictionary is absent from the active stack and database.

If there are other engine paths that permanently discard a `PythonDictionary`, they should obey the same lifecycle rule.

---

## Bug 2: `feralNumberKey` is configured but ignored by `strokeFromSteno()`

`StrokeConfig` contains:

```ts
feralNumberKey: boolean
```

and English Stenotype config sets:

```ts
FERAL_NUMBER_KEY = true
```

The intended Plover semantics of a feral number key are that the number key may appear at non-leading positions in RTFCRE input.

For example, when feral-number-key behavior is enabled, forms equivalent to:

```text
#18
1#8
18#
```

should represent the same number-bar stroke.

However, the current parser does not consult:

```ts
cfg.feralNumberKey
```

at all.

It contains special handling only for a **leading** number key:

```ts
if (cfg.numberKey && remaining.startsWith('#')) {
    hasNumber = true;
    remaining = remaining.slice(1);
}
```

Non-leading `#` characters may happen to be tolerated because unmatched characters are skipped during parsing, but that is accidental behavior rather than implementation of `feralNumberKey`.

### Why this matters

A configuration option that is never consulted cannot express the distinction it claims to represent.

The parser currently cannot deliberately enforce:

```text
feralNumberKey = true
    → number key may occur anywhere permitted by the steno grammar

feralNumberKey = false
    → noncanonical number-key placement is not accepted as feral syntax
```

If both configurations behave the same because `#` is simply ignored when encountered in an unexpected location, the abstraction is incomplete.

### Expected behavior

Number-key parsing should explicitly incorporate:

```ts
cfg.numberKey
cfg.numbers
cfg.feralNumberKey
```

rather than obtaining feral behavior accidentally from unknown-character skipping.

The implementation should clearly define and test:

```text
feralNumberKey = true
feralNumberKey = false
```

as distinct parser configurations.

### Regression tests

At minimum, construct a small test configuration and verify both modes.

For `feralNumberKey = true`, equivalent number-key positions should parse equivalently where supported by the RTFCRE grammar.

For `feralNumberKey = false`, forms that require feral placement should not silently gain the same semantics merely because an unexpected `#` was skipped.

Tests should compare actual stroke values/key sets rather than only serialized strings.

---

## Required cleanup: remove special `DICTIONARY = {...}` support from Python dictionaries

PR #47 correctly establishes the model:

```text
JSON dictionary
    → has concrete entries

Python dictionary
    → does not expose concrete entries
```

However, `PythonDictionary` still contains an older special case that undermines this distinction.

During initialization it explicitly probes the Python global namespace:

```python
'DICTIONARY' in dir()
```

If present, Stripped Plover serializes the mapping back into JavaScript and stores it in:

```ts
private _entries: Array<[string[], string]> = [];
private _length = -1;
```

It then gives that Python dictionary several pseudo-entry behaviors:

```ts
entries()
items()
length
```

and even uses `_entries` as a reverse-lookup fallback when the Python source has no `reverse_lookup()` function.

This support should be removed.

### Why `DICTIONARY` support is conceptually wrong

A Python dictionary is executable behavior.

Its public dictionary contract is:

```python
LONGEST_KEY
lookup(key)
```

with optional:

```python
reverse_lookup(value)
```

A global variable named:

```python
DICTIONARY
```

is merely one possible implementation detail of that Python code.

For example:

```python
DICTIONARY = {
    ("TEFT",): "test",
}

def lookup(key):
    return DICTIONARY[key]
```

is valid code because `lookup()` happens to use that mapping internally.

But this does **not** mean that Stripped Plover should reach into the Python program, inspect `DICTIONARY`, copy it into JavaScript, expose a length for it, or infer entry enumeration/reverse lookup from it.

Doing so creates two incompatible models of Python dictionaries:

```text
Python dictionary without DICTIONARY global
    → no concrete entries

Python dictionary with DICTIONARY global
    → secretly treated as partially enumerable
```

That directly weakens the representation boundary introduced by PR #47.

### `DICTIONARY` must not become a protocol

The name `DICTIONARY` should have no special meaning to Stripped Plover.

Python code remains free to define:

```python
DICTIONARY = ...
```

if it wants to use that variable internally.

The requirement is:

> **Stripped Plover must stop detecting, reading, serializing, enumerating, or otherwise interpreting a Python global named `DICTIONARY`.**

It should be treated exactly like:

```python
_CACHE
WORDS
foo
whatever
```

from the host's perspective.

---

## Required PythonDictionary simplification

Remove:

```ts
private _entries
private _length
```

and all initialization logic that probes:

```python
'DICTIONARY' in dir()
```

Remove Python-side pseudo-enumeration methods whose only implementation is the copied `DICTIONARY` mapping:

```ts
entries()
items()
```

unless they are required by some unrelated interface. After PR #47 they should not be required by the common dictionary interface.

Python dictionary length should not be inferred from a Python global mapping.

A Python dictionary's state description should therefore consistently use the representation's actual semantics.

For example:

```json
{
  "identifier": "Jeff",
  "type": "python",
  "enabled": true,
  "entries": -1
}
```

if the protocol retains the common `entries` field and uses `-1` to mean “not enumerable”.

Alternatively, if the protocol is being cleaned up further, an explicit nullable/optional representation may be preferable.

The critical invariant is:

```text
Python dictionary entry count is not derived by introspecting DICTIONARY
```

---

## Reverse lookup behavior

The current implementation also contains:

```ts
if (this._entries.length > 0 && !this._hasReverseLookup) {
    return new Set(
        this._entries
            .filter(([, value]) => value === translation)
            .map(([stroke]) => stroke)
    );
}
```

This fallback must be removed with `DICTIONARY` support.

A Python dictionary supports reverse lookup only if its executable interface provides:

```python
reverse_lookup(value)
```

Otherwise reverse lookup returns no results for that dictionary.

Stripped Plover should not infer an additional capability from the accidental presence of a mapping with a particular global variable name.

---

## LONGEST_KEY must remain authoritative

The current `DICTIONARY` enumeration path can also increase `_longestKey` based on the copied mapping.

That should disappear.

For a Python dictionary:

```python
LONGEST_KEY
```

is part of the explicit executable dictionary contract and should be authoritative.

The host should not inspect arbitrary Python data and silently derive a different effective value.

---

## Tests that need updating

Current Python import tests use a Python source shaped approximately like:

```python
LONGEST_KEY = 2

DICTIONARY = {
    ('TEFT',): 'test',
    ('HEL', 'HROE'): 'hello',
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)

def reverse_lookup(value):
    return [k for k, v in DICTIONARY.items() if v == value]
```

The Python program may continue using `DICTIONARY` internally if useful for the test.

What must change is the host-side expectation.

Importing this code must **not** cause Stripped Plover to enumerate that global or claim two concrete entries merely because it exists.

Tests should verify:

```text
type = "python"
entries = unknown / -1 according to protocol
lookup works
reverse_lookup works only through the Python function
```

Add a particularly important regression test where:

```python
DICTIONARY = {
    ('TEFT',): 'internal value'
}
```

exists but the actual `lookup()` function intentionally behaves differently.

For example:

```python
LONGEST_KEY = 1

DICTIONARY = {
    ('TEFT',): 'do not introspect me'
}

def lookup(key):
    if key == ('TEFT',):
        return 'actual lookup result'
    raise KeyError(key)
```

Stripped Plover must treat:

```text
actual lookup result
```

as authoritative and must never expose:

```text
do not introspect me
```

through enumeration or reverse-lookup inference.

That test establishes that `DICTIONARY` is ordinary private Python state, not part of the Stripped Plover dictionary ABI.

---

## Desired Python dictionary contract after this cleanup

The host-visible model should be small and explicit.

### Required

```python
LONGEST_KEY: int

def lookup(key: tuple[str, ...]) -> str:
    ...
```

### Optional

```python
def reverse_lookup(value: str) -> list[tuple[str, ...]]:
    ...
```

### Not part of the contract

```python
DICTIONARY
entries()
items()
host-side inspection of Python globals
host-side inference of entry count
host-side inferred reverse lookup
```

The Python implementation may internally contain any data structures it wants. They remain implementation details behind `lookup()` and `reverse_lookup()`.

---

## Acceptance criteria

- `remove_dictionary` deterministically terminates a removed `PythonDictionary` runtime.
- Replacing and removing Python dictionaries obey the same runtime-lifecycle rule.
- Tests verify Python runtime termination on removal.
- `strokeFromSteno()` explicitly honors `feralNumberKey`.
- Tests distinguish `feralNumberKey = true` from `feralNumberKey = false`.
- Feral number-key behavior is not an accidental consequence of skipping unknown characters.
- Stripped Plover no longer checks whether `DICTIONARY` exists in Python globals.
- Stripped Plover no longer serializes or copies `DICTIONARY` contents into JavaScript.
- `PythonDictionary` no longer stores pseudo-concrete `_entries`.
- Python dictionary length is not inferred from `DICTIONARY`.
- Python `LONGEST_KEY` remains authoritative.
- Python dictionaries no longer expose host-side `entries()` / `items()` based on `DICTIONARY`.
- Reverse lookup uses the Python `reverse_lookup()` function when provided and does not fall back to inspecting `DICTIONARY`.
- A Python variable named `DICTIONARY` is treated as an ordinary private implementation detail.
- State APIs continue to identify the representation explicitly as `type: "python"`.
- JSON dictionaries remain the only dictionary representation exposing concrete entry CRUD/enumeration.