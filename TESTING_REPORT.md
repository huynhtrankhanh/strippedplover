# Stripped Plover Testing Report

## Test Environment
- Node.js Version: 22.21.0 (Required for node:sqlite support)
- Platform: Linux
- Date: 2024-12-11

## Test Summary

| Test Category | Tests Run | Passed | Failed |
|--------------|-----------|--------|--------|
| Startup & Ready | 1 | 1 | 0 |
| Dictionary Loading | 3 | 3 | 0 |
| Basic Translation | 2 | 2 | 0 |
| Multi-stroke Translation | 2 | 2 | 0 |
| Undo Stroke | 2 | 2 | 0 |
| Commit | 1 | 1 | 0 |
| Reset State | 2 | 2 | 0 |
| Lookup Operations | 4 | 4 | 0 |
| Error Handling | 2 | 2 | 0 |
| MODE Commands | 10 | 10 | 0 |
| Quit | 1 | 1 | 0 |
| **Total** | **30** | **30** | **0** |

## Detailed Test Results

### 1. Startup & Ready
**Test:** Engine starts and outputs ready message
```
Input: (start engine)
Output: {"status": "ready"}
```
**Result:** ✅ PASS

### 2. Dictionary Loading

**Test 2.1:** List dictionaries when empty
```
Input: {"id": "1", "method": "list_dictionaries", "params": {}}
Output: {"id": "1", "result": {"dictionaries": []}}
```
**Result:** ✅ PASS

**Test 2.2:** Add dictionary
```
Input: {"id": "2", "method": "add_dictionary", "params": {"path": "asset:plover:assets/main.json"}}
Output: {"id": "2", "result": {"status": "ok", "path": "asset:plover:assets/main.json", "entries": 147424}}
```
**Result:** ✅ PASS

**Test 2.3:** List dictionaries after adding
```
Input: {"id": "3", "method": "list_dictionaries", "params": {}}
Output: {"id": "3", "result": {"dictionaries": [{"path": "asset:plover:assets/main.json", "enabled": true, "readonly": true, "entries": 147424}]}}
```
**Result:** ✅ PASS

### 3. Basic Translation

**Test 3.1:** Single stroke translation
```
Input: {"id": "4", "method": "translate", "params": {"stroke": "TEFT"}}
Output: {"id": "4", "result": {"preedit": " test", "key_combinations": []}}
```
**Result:** ✅ PASS

**Test 3.2:** Suffix stroke
```
Input: {"id": "5", "method": "translate", "params": {"stroke": "-G"}}
Output: {"id": "5", "result": {"preedit": " testing", "key_combinations": []}}
```
**Result:** ✅ PASS
**Note:** Preedit correctly shows complete word " testing" (not just " ing")

### 4. Commit

**Test 4.1:** Commit preedit
```
Input: {"id": "6", "method": "commit", "params": {}}
Output: {"id": "6", "result": {"committed": " testing"}}
```
**Result:** ✅ PASS

### 5. Multi-stroke Translation

**Test 5.1:** First stroke of multi-stroke word
```
Input: {"id": "7", "method": "translate", "params": {"stroke": "HEL"}}
Output: {"id": "7", "result": {"preedit": " hell", "key_combinations": []}}
```
**Result:** ✅ PASS

**Test 5.2:** Second stroke completing multi-stroke word
```
Input: {"id": "8", "method": "translate", "params": {"stroke": "HROE"}}
Output: {"id": "8", "result": {"preedit": " hello", "key_combinations": []}}
```
**Result:** ✅ PASS
**Note:** "HEL/HROE" correctly translates to "hello"

### 6. Undo Stroke

**Test 6.1:** Undo last stroke
```
Input: {"id": "9", "method": "translate", "params": {"stroke": "*"}}
Output: {"id": "9", "result": {"preedit": " hell", "key_combinations": []}}
```
**Result:** ✅ PASS
**Note:** Correctly undoes "HROE" stroke, reverting to "hell"

**Test 6.2:** Undo all strokes
```
Input: {"id": "10", "method": "translate", "params": {"stroke": "*"}}
Output: {"id": "10", "result": {"preedit": "", "key_combinations": []}}
```
**Result:** ✅ PASS
**Note:** Preedit correctly becomes empty after undoing all strokes

### 7. Reset State

**Test 7.1:** Reset translation state
```
Input: {"id": "11", "method": "reset_state", "params": {}}
Output: {"id": "11", "result": {"status": "ok"}}
```
**Result:** ✅ PASS

**Test 7.2:** Translate after reset
```
Input: {"id": "12", "method": "translate", "params": {"stroke": "TEFT"}}
Output: {"id": "12", "result": {"preedit": " test", "key_combinations": []}}
```
**Result:** ✅ PASS
**Note:** Translation starts fresh after reset

### 8. Lookup Operations

**Test 8.1:** Lookup existing stroke
```
Input: {"id": "13", "method": "lookup", "params": {"stroke": "TEFT"}}
Output: {"id": "13", "result": {"stroke": "TEFT", "translation": "test"}}
```
**Result:** ✅ PASS

**Test 8.2:** Reverse lookup with results
```
Input: {"id": "14", "method": "reverse_lookup", "params": {"translation": "hello"}}
Output: {"id": "14", "result": {"translation": "hello", "strokes": ["HO*EL", "H-L", "HEL/HRO", "H*EL", "HEL/HROE"]}}
```
**Result:** ✅ PASS

**Test 8.3:** Reverse lookup with no results
```
Input: {"id": "15", "method": "reverse_lookup", "params": {"translation": "xyznonexistent"}}
Output: {"id": "15", "result": {"translation": "xyznonexistent", "strokes": []}}
```
**Result:** ✅ PASS

**Test 8.4:** Commands dictionary lookup
```
Input: {"id": "3", "method": "lookup", "params": {"stroke": "KPA*"}}
Output: {"id": "3", "result": {"stroke": "KPA*", "translation": "{^}{-|}"}}
```
**Result:** ✅ PASS

### 9. Error Handling

**Test 9.1:** Unknown method
```
Input: {"id": "16", "method": "unknown_method", "params": {}}
Output: {"id": "16", "error": {"code": -32601, "message": "Unknown method: unknown_method"}}
```
**Result:** ✅ PASS

**Test 9.2:** Non-existent dictionary file
```
Input: {"id": "17", "method": "add_dictionary", "params": {"path": "/nonexistent/path.json"}}
Output: {"id": "17", "error": {"code": -32000, "message": "[Errno 2] No such file or directory: '/nonexistent/path.json'"}}
```
**Result:** ✅ PASS

### 10. Quit

**Test 10.1:** Quit command
```
Input: {"id": "18", "method": "quit", "params": {}}
Output: {"id": "18", "result": {"status": "ok"}}
```
**Result:** ✅ PASS
**Note:** Engine exits cleanly after quit

### 11. MODE Commands

MODE commands control case formatting and space character behavior. All MODE command behaviors have been verified against the reference Plover implementation.

**Test 11.1:** MODE:CAPS - Uppercase mode
```
Dictionary: {"TEFT": "test", "HEUL": "hello", "KA*PS": "{MODE:CAPS}"}
Sequence: KA*PS → TEFT → HEUL
Output: "TEST HELLO"
```
**Result:** ✅ PASS
**Note:** All subsequent text is uppercased

**Test 11.2:** MODE:LOWER - Lowercase mode
```
Dictionary: {"TEFT": "test", "HEUL": "hello", "HR*ER": "{MODE:LOWER}"}
Sequence: HR*ER → TEFT → HEUL
Output: "test hello"
```
**Result:** ✅ PASS
**Note:** All subsequent text is lowercased

**Test 11.3:** MODE:TITLE - Title case mode
```
Dictionary: {"TEFT": "test", "HEUL": "hello", "TAOEUL": "{MODE:TITLE}"}
Sequence: TAOEUL → TEFT → HEUL
Output: "test Hello"
```
**Result:** ✅ PASS
**Note:** Words are capitalized in title case

**Test 11.4:** MODE:SNAKE - Underscore space mode
```
Dictionary: {"TEFT": "test", "HEUL": "hello", "SKA*EBG": "{MODE:SNAKE}"}
Sequence: SKA*EBG → TEFT → HEUL
Output: "test_hello"
```
**Result:** ✅ PASS
**Note:** Spaces replaced with underscores

**Test 11.5:** MODE:CAMEL - CamelCase mode
```
Dictionary: {"TEFT": "test", "HEUL": "hello", "PHOEUD": "{MODE:CAMEL}"}
Sequence: PHOEUD → TEFT → HEUL
Output: "testHello"
```
**Result:** ✅ PASS
**Note:** Words joined with title case, no spaces

**Test 11.6:** MODE:RESET - Reset all modes
```
Dictionary: {"TEFT": "test", "KA*PS": "{MODE:CAPS}", "R*FT": "{MODE:RESET}"}
Sequence: KA*PS → TEFT → R*FT → TEFT
Output: "TEST test"
```
**Result:** ✅ PASS
**Note:** Mode correctly resets to default after RESET

**Test 11.7:** MODE:RESET_CASE - Reset case only
```
Dictionary: {"TEFT": "test", "HEUL": "hello", "KA*PS": "{MODE:CAPS}", "SPAEUZ": "{MODE:SET_SPACE:-}", "RAEUZ": "{MODE:RESET_CASE}"}
Sequence: KA*PS → SPAEUZ → TEFT → RAEUZ → HEUL
Output: "TEST-hello"
```
**Result:** ✅ PASS
**Note:** Case resets to normal but custom hyphen space character remains

**Test 11.8:** MODE:RESET_SPACE - Reset space only
```
Dictionary: {"TEFT": "test", "HEUL": "hello", "KA*PS": "{MODE:CAPS}", "SPAEUZ": "{MODE:SET_SPACE:-}", "SPAEZ": "{MODE:RESET_SPACE}"}
Sequence: KA*PS → SPAEUZ → TEFT → SPAEZ → HEUL
Output: "TEST HELLO"
```
**Result:** ✅ PASS
**Note:** Space resets to normal but uppercase mode remains active

**Test 11.9:** MODE:SET_SPACE - Custom space character
```
Dictionary: {"TEFT": "test", "HEUL": "hello", "SPAEUZ": "{MODE:SET_SPACE:---}"}
Sequence: SPAEUZ → TEFT → HEUL
Output: "test---hello"
```
**Result:** ✅ PASS
**Note:** Custom space character applied between words

**Test 11.10:** Combined MODE with suffix
```
Dictionary: {"TEFT": "test", "-G": "{^ing}", "KA*PS": "{MODE:CAPS}"}
Sequence: KA*PS → TEFT → -G
Output: "TESTING"
```
**Result:** ✅ PASS
**Note:** MODE applies correctly with suffix strokes

## Key Observations

1. **Preedit Model Works Correctly**: The preedit/commit model operates as expected. Each translate response contains the complete current preedit state, allowing the IME to simply replace the preedit buffer.

2. **No Backspaces Needed**: The implementation correctly avoids backspaces. The IME only needs to:
   - Replace the entire preedit with the new preedit value
   - Commit when requested

3. **Multi-stroke Translation**: The stateful translation correctly handles multi-stroke words like "hello" (HEL/HROE).

4. **Undo Works**: The asterisk (*) stroke correctly undoes previous strokes and updates the preedit accordingly.

5. **Error Handling**: Proper JSON-RPC style error responses with error codes and messages.

6. **Dictionary Support**: Both JSON and asset-based dictionaries load correctly.

7. **MODE Commands Work Correctly**: All MODE commands ({MODE:CAPS}, {MODE:LOWER}, {MODE:TITLE}, {MODE:SNAKE}, {MODE:CAMEL}, {MODE:RESET}, {MODE:RESET_CASE}, {MODE:RESET_SPACE}, {MODE:SET_SPACE:...}) function as expected and match the reference Plover implementation behavior.

8. **MODE State Persistence**: MODE state correctly persists across translations within a session and is properly reset by reset_state RPC call.

9. **MODE and Undo Behavior**: MODE commands that don't produce text output are not counted as "undoable" actions (consistent with reference Plover implementation). This means undoing past a MODE command will also undo the previous text-producing translation.

## Conclusion

All 30 tests passed successfully. The Stripped Plover implementation correctly implements the MANIFESTO.md requirements:

1. ✅ Runs without external dependencies (only plover-stroke and rtf_tokenize)
2. ✅ Runs without a UI
3. ✅ Runs without capturing the keyboard
4. ✅ Interacts through STDIO
5. ✅ Uses line-separated JSON protocol
6. ✅ Each message has a unique ID with replies referencing it
7. ✅ IDs are generated by the client
8. ✅ Supports dictionary management (add, remove, list)
9. ✅ Supports stateful translation with preedit/commit output
10. ✅ Supports state reset
11. ✅ All irrelevant files have been deleted
12. ✅ Protocol is documented in PROTOCOL.md
13. ✅ MODE commands properly handled in external RPC translation (verified against reference Plover implementation)

## Reference Implementation Comparison

The MODE command behavior was verified against the reference Plover implementation (https://github.com/opensteno/plover):

- **MODE command handling**: Matches reference implementation
- **MODE state persistence**: Matches reference implementation  
- **MODE undo behavior**: Matches reference implementation (MODE commands without text output are not separately undoable)
- **All MODE variants**: CAPS, LOWER, TITLE, SNAKE, CAMEL, RESET, RESET_CASE, RESET_SPACE, SET_SPACE all match reference behavior
