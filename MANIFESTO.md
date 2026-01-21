# Translation Provenance

Every time a new stroke gets processed, a translation array gets outputted. But it is currently impossible to tell the source of a translation.

The problem is deterministic translations don't fulfill all needs. For example, when it comes to Chinese, there's often an AI layer that converts pinyin into characters, and that layer can behave unpredictably until commitment, or finalization.

Stripped Plover uses a stack of dictionaries to guide translation decisions. But the new requirement is:

**SOME DICTIONARIES ARE SPECIFICALLY MARKED AS NEEDING A FURTHER AI LAYER IN THE INTERPRETATION OF THEIR OUTPUT**

Let's call them Nonliteral Dictionaries.
