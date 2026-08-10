# Add atomic dictionary-entry mutation RPCs and remove unsafe mutation paths

## Summary

Stripped Plover should provide atomic, conflict-aware dictionary-entry mutation RPCs upstream and remove the older mutation paths that can overwrite state without checking what the client previously observed.

V7 currently needs the following RPCs for its Android “Add Stripped Plover translation” flow:

- `add_entry_safely`
- `replace_entry`

These are currently injected into Stripped Plover by a downstream Android build transform. That downstream patch should not be necessary: the behavior belongs in Stripped Plover itself because it defines dictionary mutation semantics and the RPC protocol.

At the same time, the older unsafe entry mutation RPCs should be removed from the public protocol once callers have migrated:

- `add_entry`
- `update_entry`

The goal is to leave one canonical conflict-aware path for creating and replacing dictionary entries, instead of supporting both safe and unsafe mutation APIs indefinitely.

---

## Problem

The existing mutation methods allow a client to mutate dictionary state without protecting against races between “read/check” and “write”.

For example, a UI that wants to add a translation safely might otherwise have to do:

1. Look up the outline.
2. Decide whether it is free.
3. Call `add_entry`.

That sequence is not atomic. The dictionary can change between steps 1 and 3.

Similarly, a UI that wants to replace an existing translation might otherwise do:

1. Look up the current translation.
2. Show it to the user.
3. Ask the user to confirm replacement.
4. Call `update_entry`.

That also allows stale state to be overwritten. If another mutation occurs after the lookup but before the update, the later `update_entry` blindly replaces whatever is present at that point.

For interactive dictionary editing, these are compare-and-set operations and should be represented as such in the engine protocol.

---

## Current downstream workaround

V7 currently patches the Stripped Plover engine during the Android web-runtime build.

The downstream transform adds dispatch cases equivalent to:

```ts
case "add_entry_safely":
  result = this.addEntrySafely(params);
  break;

case "replace_entry":
  result = this.replaceEntrySafely(params);
  break;
```

and injects corresponding engine methods.

This is fragile for several reasons:

- A downstream build can accidentally bundle an unpatched engine and return `Unknown method: add_entry_safely`.
- The downstream project has to source-transform upstream `engine.ts`.
- Typechecking and bundling can accidentally operate on different engine copies.
- Protocol behavior becomes split between Stripped Plover and downstream consumers.
- Other consumers cannot rely on the same safe mutation semantics unless they reproduce the patch.

This behavior should live upstream.

---

## Proposed API

### `add_entry_safely`

Adds an entry only if the outline does not already exist in the selected concrete dictionary.

### Parameters

```json
{
  "name": "dictionary.json",
  "stroke": "TPH/TPH/TPH",
  "translation": "example"
}
```

`name` may follow the same optional/default-dictionary behavior as the existing entry mutation methods if that behavior is intended to remain supported.

### Success

If the outline is absent, insert it and return:

```json
{
  "status": "ok",
  "conflict": false,
  "stroke": "TPH/TPH/TPH",
  "translation": "example"
}
```

### Conflict

If the outline already exists, do not modify the dictionary and return:

```json
{
  "status": "conflict",
  "conflict": true,
  "stroke": "TPH/TPH/TPH",
  "existing_translation": "existing value"
}
```

The conflict is an expected application result, not a protocol error.

### Suggested implementation

Equivalent to the downstream implementation:

```ts
private addEntrySafely(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const stroke = params.stroke as string;
  const translation = params.translation as string;
  const name = params.name as string | undefined;

  if (!stroke || !translation) {
    throw new Error("Both stroke and translation are required");
  }

  const strokeTuple = normalizeSteno(stroke, false);
  const selected = name
    ? this.dictionaries.get(name)
    : this.dictionaries.firstWithEntries();

  if (!selected) {
    throw new Error(`Dictionary not found: ${name}`);
  }

  if (!(selected instanceof StenoDictionary)) {
    throw new Error(
      `Dictionary does not expose concrete entries: ${name}`,
    );
  }

  const existing = selected.get(strokeTuple);
  if (existing !== null) {
    return {
      status: "conflict",
      conflict: true,
      stroke: strokeTuple.join("/"),
      existing_translation: existing,
    };
  }

  selected.set(strokeTuple, translation);

  return {
    status: "ok",
    conflict: false,
    stroke: strokeTuple.join("/"),
    translation,
  };
}
```

---

## `replace_entry`

Replaces an entry only if its current translation still matches the value previously observed by the caller.

This is a compare-and-set operation.

### Parameters

```json
{
  "name": "dictionary.json",
  "stroke": "TPH/TPH/TPH",
  "translation": "new value",
  "expected_translation": "value previously observed"
}
```

### Success

If the current translation equals `expected_translation`, replace it and return:

```json
{
  "status": "ok",
  "conflict": false,
  "stroke": "TPH/TPH/TPH",
  "translation": "new value"
}
```

### Conflict

If the current translation no longer equals `expected_translation`, do not modify the dictionary and return:

```json
{
  "status": "conflict",
  "conflict": true,
  "stroke": "TPH/TPH/TPH"
}
```

This includes the case where the entry was deleted after the caller observed it.

### Suggested implementation

Equivalent to the downstream implementation:

```ts
private replaceEntrySafely(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const stroke = params.stroke as string;
  const translation = params.translation as string;
  const expected = params.expected_translation;
  const name = params.name as string | undefined;

  if (!stroke || !translation || typeof expected !== "string") {
    throw new Error(
      "Stroke, translation, and expected translation are required",
    );
  }

  const strokeTuple = normalizeSteno(stroke, false);
  const selected = name
    ? this.dictionaries.get(name)
    : this.dictionaries.firstWithEntries();

  if (!selected) {
    throw new Error(`Dictionary not found: ${name}`);
  }

  if (!(selected instanceof StenoDictionary)) {
    throw new Error(
      `Dictionary does not expose concrete entries: ${name}`,
    );
  }

  const existing = selected.get(strokeTuple);
  if (existing !== expected) {
    return {
      status: "conflict",
      conflict: true,
      stroke: strokeTuple.join("/"),
    };
  }

  selected.set(strokeTuple, translation);

  return {
    status: "ok",
    conflict: false,
    stroke: strokeTuple.join("/"),
    translation,
  };
}
```

The RPC dispatch would include:

```ts
case "add_entry_safely":
  result = this.addEntrySafely(params);
  break;

case "replace_entry":
  result = this.replaceEntrySafely(params);
  break;
```

---

## Remove the unsafe mutation paths

Adding the safe methods without removing the old mutation APIs would leave two ways to perform the same operations, one of which silently bypasses conflict protection.

The public protocol should therefore converge on the safe operations.

### Remove `add_entry`

The current `add_entry` path writes with `set(...)` after resolving a dictionary.

If the stroke already exists, this can overwrite it rather than reporting a conflict.

That is exactly the behavior `add_entry_safely` is intended to prevent.

After callers migrate, remove `add_entry` from `handleRequest()` and remove the corresponding private implementation.

A caller that wants to create an entry should use `add_entry_safely`.

### Remove `update_entry`

The current `update_entry` path does not provide compare-and-set semantics.

When a dictionary is explicitly named, it can write the requested translation without verifying that the current entry is the value the caller believes it is replacing.

For user-facing editing this makes stale writes possible.

After callers migrate, remove `update_entry` from `handleRequest()` and remove the corresponding private implementation.

A caller that wants to replace an existing entry should use `replace_entry` with `expected_translation`.

### Why removal is preferable to keeping aliases

Keeping `add_entry` and `update_entry` as permanent aliases would preserve the unsafe behavior and make it easy for new code to choose the wrong operation.

The protocol should make the safe path the obvious and canonical path.

If compatibility requires a transition period, the old methods can be deprecated for one release, but the intended end state should be their removal.

---

## What about `remove_entry`?

`remove_entry` is a different operation and does not need to be removed as part of this issue solely because `add_entry` and `update_entry` are being replaced.

However, its semantics should be explicit:

- If `remove_entry` means “unconditionally delete this outline if present”, it can remain as such.
- If consumers need “delete only if the translation is still the value I observed”, that should be a separate compare-and-delete operation rather than a client-side lookup followed by unconditional removal.

The important part for this issue is that create and replace no longer have blind-write alternatives.

---

## Error semantics

Expected conflicts should be returned as normal results:

```json
{
  "status": "conflict",
  "conflict": true
}
```

They should not be returned through the protocol `error` object.

Protocol errors should remain reserved for invalid requests and exceptional conditions such as:

- missing required parameters
- dictionary not found
- selected dictionary does not expose concrete entries
- invalid stroke
- unknown RPC method
- internal engine/database failures

This lets clients distinguish ordinary editing conflicts from actual failures.

---

## Atomicity requirements

The important guarantee is that each mutation performs its check and write as one engine operation.

For `add_entry_safely`:

```text
check absent -> insert
```

must not be represented as separate client-visible RPCs.

For `replace_entry`:

```text
read current value -> compare expected value -> replace
```

must happen inside one RPC.

If the engine execution model can process dictionary mutations concurrently, the check and write should also be protected at the storage/transaction layer so two simultaneous requests cannot both pass the same check.

---

## Migration plan

Suggested migration:

1. Add `add_entry_safely`.
2. Add `replace_entry`.
3. Add tests for both methods.
4. Update first-party callers to use the new methods.
5. Mark `add_entry` and `update_entry` deprecated if a compatibility window is required.
6. Remove `add_entry` and `update_entry` from the protocol.
7. Remove the old private implementations.
8. Remove V7's downstream `transformEngine()` compatibility patch once V7 pins a Stripped Plover revision containing the upstream implementation.

If Stripped Plover does not require a compatibility window, steps 5 and 6 can happen in the same change.

---

## Tests

Please add protocol-level tests covering at least the following.

### `add_entry_safely`

- inserts a missing outline
- returns `conflict: false` on successful insertion
- returns the normalized stroke
- returns the inserted translation
- does not modify an existing outline
- returns `conflict: true` for an existing outline
- returns `existing_translation`
- supports an explicitly selected JSON dictionary
- rejects a missing dictionary
- rejects a dictionary without concrete entries
- validates missing/empty stroke
- validates missing/empty translation

### `replace_entry`

- replaces when `expected_translation` matches
- returns `conflict: false` on successful replacement
- does not modify the entry when the expected value is stale
- returns `conflict: true` when the expected value is stale
- returns conflict if the entry disappeared after the caller observed it
- supports an explicitly selected JSON dictionary
- rejects a missing dictionary
- rejects a dictionary without concrete entries
- validates missing/empty stroke
- validates missing/empty translation
- validates missing/non-string `expected_translation`

### Removal of unsafe methods

After the migration/removal point:

```json
{"id":1,"method":"add_entry","params":{}}
```

and

```json
{"id":2,"method":"update_entry","params":{}}
```

should no longer expose the old mutation behavior.

Depending on the project's protocol policy, they should either return `UNKNOWN_METHOD` or a deliberate removed/deprecated-method error during a transition release.

There should also be a test ensuring the canonical create/replace code paths do not internally fall back to the removed blind-write methods.

---

## Acceptance criteria

- [ ] `add_entry_safely` is implemented upstream.
- [ ] `replace_entry` is implemented upstream.
- [ ] Both methods are exposed by `handleRequest()`.
- [ ] Existing-entry creation conflicts are returned without modifying the dictionary.
- [ ] Replacement uses `expected_translation` and does not overwrite stale state.
- [ ] Conflict outcomes are normal results rather than protocol errors.
- [ ] `add_entry` is deprecated/removed from the public protocol.
- [ ] `update_entry` is deprecated/removed from the public protocol.
- [ ] Tests cover success, conflict, validation, missing dictionaries, and non-concrete dictionaries.
- [ ] Tests cover removal of the unsafe methods.
- [ ] V7 can delete its downstream engine source transform after updating its pinned Stripped Plover revision.

---

## Motivation from V7

V7's Android “Add Stripped Plover translation” UI already expects these safe semantics:

1. Try `add_entry_safely`.
2. If there is no conflict, finish.
3. If there is a conflict, show the existing translation to the user.
4. If the user confirms replacement, call `replace_entry` with the previously observed translation as `expected_translation`.
5. If that value changed before replacement, report a conflict rather than overwriting the newer value.

That flow avoids both accidental overwrite on add and stale overwrite on replace.

Moving these RPCs upstream and removing the blind-write alternatives would make those semantics part of Stripped Plover's protocol rather than a downstream patch.
