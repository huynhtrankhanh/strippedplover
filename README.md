# Stripped Plover

This repository is reduced to the essentials described in the
[Manifesto](MANIFESTO.md):

* No external dependencies.
* No UI and no keyboard capture.
* A single line-delimited JSON protocol over STDIO.
* Stateful translation with dictionary management.

## Protocol

Messages are one JSON object per line. The client generates unique `id`
values for requests; server replies must echo that `id` as
`in_reply_to`.

### Dictionary management

* `dictionary.add` / `dictionary.remove`: add or remove a dictionary.
* `dictionary.entry.set`: create or update an entry.
* `dictionary.entry.delete`: delete an entry.

Requests contain the target dictionary and entry data; responses confirm
success or describe an error.

### Translation

* `stroke`: send one or more stenographic strokes to advance the engine.
  The engine replies with zero or more of:
  * `preedit` — current preedit text.
  * `commit` — text to commit.
  * `literal` — literal keypresses to emit.
* `reset`: clear internal translation state.

Translation is stateful: multi-stroke translations depend on previous
strokes and must be preserved until a `commit` or `reset` concludes the
sequence.
