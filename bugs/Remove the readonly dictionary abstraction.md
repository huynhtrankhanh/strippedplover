# Remove the `readonly` dictionary abstraction

## Summary

Stripped Plover currently models dictionaries with a generic `readonly` property. This abstraction should be removed entirely.

The distinction that currently motivates `readonly` is not actually mutability:

- JSON dictionaries have concrete `(stroke, translation)` entries.
- Python dictionaries do not have concrete entries. They are executable code implementing dictionary behavior.

A Python dictionary therefore is not a dictionary whose entries happen to be read-only. It simply does not expose an entry collection to mutate.

These are different concepts, and representing the latter as `readonly` leaks incorrect semantics throughout the engine and downstream consumers.

## Current design

`StenoDictionaryLike` exposes:

```ts
readonly: boolean;
```

`StenoDictionary` stores and enforces it, including checks in operations such as:

```ts
set(...)
delete(...)
clear(...)
update(...)
```

The dictionary collection also contains concepts such as:

```ts
firstWritable()
```

The SQLite `dictionaries` table persists a `readonly` column, and Python dictionaries are imported with that flag set.

The RPC/UI-facing dictionary description then exposes the same property to consumers.

## Problem

`readonly` conflates two independent questions:

1. Does this dictionary have concrete entries?
2. Is this dictionary object allowed to be managed?

For a JSON dictionary:

```text
concrete entries: yes
entry mutation: yes
rename dictionary: yes
delete dictionary: yes
```

For a Python dictionary:

```text
concrete entries: no
entry mutation: not applicable
rename dictionary: yes
delete dictionary: yes
```

There is no useful third state of “ordinary dictionary whose entries are present but read-only” in the current model.

Python dictionaries should therefore not be described as read-only.

For example, deleting a Python dictionary is perfectly meaningful: remove it from the dictionary collection and remove its stored Python source.

Renaming it is also meaningful.

What is meaningless is editing an individual entry, because no such concrete entry exists.

## Downstream consequence

This abstraction leaks into consumers such as V7.

V7 receives `readonly: true` for Python dictionaries and reasonably interprets it as a general restriction on modification. It consequently labels such dictionaries “read-only” and disables operations including Rename and Delete.

That behavior is downstream of an ambiguous upstream model.

## Proposed model

Remove `readonly` entirely.

Dictionary behavior should instead follow the actual dictionary representation or explicit capabilities.

For example:

```ts
type DictionaryType = "json" | "python";
```

or an equivalent implementation-specific distinction.

Entry operations should only exist for dictionary implementations that expose concrete entries.

A JSON/SQLite dictionary can implement:

```ts
get()
set()
delete()
entries()
update()
```

A Python dictionary can implement lookup/reverse-lookup behavior without pretending to expose mutable concrete entries.

If a common dictionary interface is needed for translation, entry-management methods should not be forced into that interface unless every implementation meaningfully supports them.

Likewise, if a future dictionary genuinely must be protected from deletion or renaming, that should be represented by a separate explicit concept such as `protected`, `builtin`, or operation-specific capabilities. It should not reuse entry mutability.

## Persistence

The SQLite schema currently contains:

```sql
readonly BOOLEAN
```

This column should ultimately be removed.

A migration may temporarily need to tolerate existing databases containing the column, but it should cease to have semantic meaning and should not remain part of the canonical schema.

Python dictionaries should be identified by their type and stored source, not by `readonly = 1`.

## RPC behavior

Dictionary descriptions should stop returning `readonly`.

Entry-management RPCs should determine whether an operation exists for the selected dictionary based on dictionary type/capability.

For a Python dictionary, requests such as adding or deleting a concrete entry should fail because that operation is not supported by that dictionary representation, not because the dictionary is “read-only”.

Dictionary-level operations such as rename, enable/disable, reorder, export, and delete remain independent.

## Acceptance criteria

- `readonly` is removed from the canonical dictionary model.
- `readonly` is removed from dictionary RPC descriptions.
- `readonly` is no longer used to choose dictionaries for mutation.
- The canonical database schema no longer requires a `readonly` column.
- Python dictionaries are modeled as dictionaries without concrete entries, not as read-only dictionaries.
- JSON dictionaries continue to support concrete entry mutation.
- Python dictionaries can still be renamed, deleted, reordered, enabled/disabled, and otherwise managed at dictionary level.
- Unsupported entry operations are rejected according to dictionary representation/capability.
- Downstream consumers no longer need to infer dictionary capabilities from a generic `readonly` flag.