# Numeric RTFCRE strokes do not round-trip through `Stroke.fromSteno`, breaking dictionary mutation

## Summary

The TypeScript stroke parser cannot correctly parse numeric RTFCRE strings emitted by its own serializer.

For number-bar strokes:

```text
parse(serialize(stroke)) != stroke
```

This causes legitimate numeric dictionary entries to work during translation while becoming impossible, or in some cases unsafe, to update/remove through dictionary-management APIs.

## Number representation

The English Stenotype system defines `#` as the number key and mappings such as:

```text
S- -> 1
T- -> 2
P- -> 3
H- -> 4
A- -> 5
O- -> 0
-F -> 6
-P -> 7
-L -> 8
-T -> 9
```

It also enables a feral number key.

A real stroke containing:

```text
# + S- + T-
```

therefore serializes through `Stroke.rtfcre` as:

```text
12
```

That string is a legitimate serialized representation produced by Stripped Plover itself.

## Current parser behavior

`strokeFromSteno()` only enters numeric parsing mode when it first sees a literal `#`.

Conceptually:

```ts
let hasNumber = false;

if (remaining.startsWith("#")) {
    hasNumber = true;
    ...
}
```

Digit aliases are interpreted as their corresponding steno keys only while `hasNumber` is already true.

Therefore:

```text
12
```

does not reconstruct:

```text
# + S- + T-
```

The digits are not converted into `S-` and `T-`.

The parser eventually notices numeric characters and adds the number key, but the digit aliases themselves have already been lost.

The effective round-trip is therefore:

```text
# + S- + T-
    ↓ serialize
12
    ↓ parse
#
```

instead of reconstructing the original stroke.

## Why translation still works

Normal translation starts from an actual `Stroke` object.

Dictionary lookup serializes those strokes using `stroke.rtfcre`.

Therefore an actual numeric stroke can produce:

```text
12
```

and successfully look up an SQLite dictionary row stored under the exact key:

```text
12
```

The entry is valid and functional during translation.

The problem appears when textual dictionary-management APIs parse that serialized representation again.

## Why remove/update fails

Entry-management methods accept a textual stroke and pass it through `normalizeSteno()`.

For an existing stored row such as:

```text
12 -> St
```

the removal path is effectively:

```text
"12"
  ↓
normalizeSteno()
  ↓
"#"
  ↓
exact lookup/delete of "#"
```

but the actual SQLite row is:

```text
"12"
```

The API therefore cannot necessarily address an entry that the engine itself enumerated.

This violates an important identity property:

```text
enumerate entry
    ↓
take returned stroke unchanged
    ↓
remove/update entry
```

should operate on that exact same entry.

## Observed database impact

In one real Stripped Plover database, there were:

```text
15,296
```

stored strokes containing ASCII digits.

All 15,296 were non-round-trippable under the current normalizer, and no other stored strokes had this problem.

Of these:

```text
14,950
```

normalized to a key absent from the same dictionary.

Those typically fail removal as “entry not found”.

More seriously:

```text
346
```

normalized to another key that already exists.

In those cases, an operation requested for one displayed entry can address a different stored entry.

This is therefore not only an undeletable-entry bug; it is potentially a wrong-entry mutation bug.

## Example collision

For example, a stored entry:

```text
12K3W4R5U7B8G -> Jacques
```

is normalized by the current parser to:

```text
#KWRUBG
```

while that key independently exists with another translation.

Attempting to remove the first entry can therefore target the second key.

## Expected invariant

Anything emitted by `Stroke.rtfcre` must be accepted by `Stroke.fromSteno()` and reconstruct the same stroke.

A core regression property should be:

```ts
const encoded = stroke.rtfcre;
const decoded = Stroke.fromSteno(encoded);

expect(decoded.value).toBe(stroke.value);
```

In particular:

```ts
Stroke.fromSteno(stroke.rtfcre).value === stroke.value
```

must hold for every representable number-bar stroke.

## Proposed fix

Fix numeric parsing in `strokeFromSteno()`.

Numeric aliases such as `0` through `9` must be recognized as number-bar notation early enough that they are converted into their configured underlying steno keys.

The implementation should respect:

- the configured number key;
- the system's numeric mappings;
- `FERAL_NUMBER_KEY`;
- non-English systems/configurations where appropriate.

It should not require a literal leading `#` before serialized numeric aliases can be interpreted.

## Regression tests

Add parser/serializer round-trip coverage for numeric strokes, including examples such as:

```text
12
234-6R
2E
123W450U8G9
12RE68S
```

and combinations involving:

- left-hand number keys;
- vowels;
- right-hand number keys;
- non-number keys mixed into numeric strokes;
- multiple strokes separated by `/`.

A property-style test over representable number-bar strokes would be preferable.

Also add an engine-level test:

1. create/import an entry with a numeric RTFCRE stroke;
2. enumerate the entry;
3. pass the returned `stroke` unchanged to `remove_entry`;
4. verify the exact entry is removed;
5. verify no other entry is modified.

The same identity guarantee should hold for `update_entry`.

## Do not normalize existing database keys before fixing the parser

Existing numeric keys such as:

```text
12
```

are legitimate serialized RTFCRE strokes.

They should not be migrated by running them through the current broken `normalizeSteno()` implementation.

Doing that can collapse distinct valid strokes onto the same incorrect normalized key and destroy data.

Fix the parser first. Existing keys should then become directly addressable without destructive rewriting.