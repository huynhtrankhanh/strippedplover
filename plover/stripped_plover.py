"""
Stripped Plover - STDIO-based stenography translation engine.

This module implements the MANIFESTO.md requirements:
1. No external dependencies (minimal)
2. No UI
3. No keyboard capture
4. STDIO-based JSON line protocol
5. Dictionary management and stateful translation

The output model uses preedit/commit semantics for IME integration:
- preedit: Current uncommitted text that can be completely replaced
- commit: Text that has been finalized
- key_combinations: Literal key presses to execute
"""

import json
import sys
import os
from typing import Dict, List, Optional, Any

# Core Plover imports
from plover.steno import Stroke
from plover.steno_dictionary import StenoDictionary, StenoDictionaryCollection
from plover.translation import Translator, Translation
from plover.formatting import Formatter, _Action, RetroFormatter
from plover import system
from plover.registry import registry


class PreeditOutputHandler:
    """
    Output handler that maintains preedit/commit state for IME integration.
    
    Instead of using backspaces, this handler tracks the full text state
    and provides preedit (uncommitted) and commit (finalized) text.
    """
    
    def __init__(self):
        self.reset_all()
    
    def reset_all(self):
        """Reset all state."""
        self._current_text = ""  # Full current text
        self._key_combinations = []
    
    def reset_stroke_output(self):
        """Reset per-stroke output capture."""
        self._key_combinations = []
    
    def send_backspaces(self, count: int):
        """Handle backspaces by removing from current text."""
        if count > 0:
            self._current_text = self._current_text[:-count]
    
    def send_string(self, text: str):
        """Append text to current output."""
        self._current_text += text
    
    def send_key_combination(self, combo: str):
        """Record a key combination."""
        self._key_combinations.append(combo)
    
    def send_engine_command(self, command: str):
        """Handle engine commands (ignored in stripped version)."""
        pass
    
    def get_preedit(self) -> str:
        """Get the current preedit text."""
        return self._current_text
    
    def get_key_combinations(self) -> List[str]:
        """Get key combinations from last stroke."""
        return self._key_combinations
    
    def commit_all(self) -> str:
        """Commit all current text and return it."""
        committed = self._current_text
        self._current_text = ""
        return committed


class StrippedPlover:
    """
    Main stripped plover engine.
    
    Provides stateful stenography translation with preedit/commit output
    suitable for IME integration.
    """
    
    def __init__(self):
        self.dictionaries: StenoDictionaryCollection = StenoDictionaryCollection()
        self.translator: Translator = Translator()
        self.formatter: Formatter = Formatter()
        self.output: PreeditOutputHandler = PreeditOutputHandler()
        
        # Setup the system
        self._setup_system()
        
        # Connect translator to formatter
        self.translator.set_dictionary(self.dictionaries)
        self.formatter.set_output(
            Formatter.output_type(
                self.output.send_backspaces,
                self.output.send_string,
                self.output.send_key_combination,
                self.output.send_engine_command,
            )
        )
        self.translator.add_listener(self.formatter.format)
    
    def _setup_system(self):
        """Setup the steno system (English Stenotype by default)."""
        registry.update()
        system.setup("English Stenotype")
    
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle a single JSON request and return a response."""
        request_id = request.get("id")
        method = request.get("method", "")
        params = request.get("params", {})
        
        try:
            if method == "translate":
                result = self._translate(params)
            elif method == "commit":
                result = self._commit()
            elif method == "reset_state":
                result = self._reset_state()
            elif method == "add_dictionary":
                result = self._add_dictionary(params)
            elif method == "remove_dictionary":
                result = self._remove_dictionary(params)
            elif method == "add_entry":
                result = self._add_entry(params)
            elif method == "remove_entry":
                result = self._remove_entry(params)
            elif method == "update_entry":
                result = self._update_entry(params)
            elif method == "lookup":
                result = self._lookup(params)
            elif method == "reverse_lookup":
                result = self._reverse_lookup(params)
            elif method == "list_dictionaries":
                result = self._list_dictionaries()
            elif method == "get_dictionary_entries":
                result = self._get_dictionary_entries(params)
            elif method == "quit":
                result = {"status": "ok"}
                return {"id": request_id, "result": result, "quit": True}
            else:
                return {
                    "id": request_id,
                    "error": {"code": -32601, "message": f"Unknown method: {method}"}
                }
            
            return {"id": request_id, "result": result}
        
        except Exception as e:
            return {
                "id": request_id,
                "error": {"code": -32000, "message": str(e)}
            }
    
    def _translate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Translate a stroke.
        
        Returns the current preedit state after processing the stroke.
        The preedit represents all uncommitted text that can be replaced
        by subsequent strokes.
        """
        stroke_str = params.get("stroke", "")
        
        # Reset per-stroke output capture (but keep preedit state)
        self.output.reset_stroke_output()
        
        # Create stroke and translate
        stroke = Stroke.from_steno(stroke_str)
        self.translator.translate(stroke)
        
        return {
            "preedit": self.output.get_preedit(),
            "key_combinations": self.output.get_key_combinations(),
        }
    
    def _commit(self) -> Dict[str, Any]:
        """
        Commit the current preedit text.
        
        This finalizes the current preedit and clears it, returning
        the committed text. The translation state is preserved for
        multi-stroke translations.
        """
        committed = self.output.commit_all()
        return {
            "committed": committed,
        }
    
    def _reset_state(self) -> Dict[str, Any]:
        """
        Reset the translation state completely.
        
        This clears both the translator state and the preedit buffer.
        Use this when focus changes or starting a new input context.
        """
        self.translator.clear_state()
        self.output.reset_all()
        return {"status": "ok"}
    
    def _add_dictionary(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Add a dictionary."""
        path = params.get("path")
        if not path:
            raise ValueError("Dictionary path is required")
        
        # Load dictionary
        from plover.dictionary.base import load_dictionary
        dictionary = load_dictionary(path, threaded_save=False)
        
        # Add to collection
        dicts = list(self.dictionaries.dicts)
        dicts.append(dictionary)
        self.dictionaries.set_dicts(dicts)
        
        return {"status": "ok", "path": path, "entries": len(dictionary)}
    
    def _remove_dictionary(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Remove a dictionary."""
        path = params.get("path")
        if not path:
            raise ValueError("Dictionary path is required")
        
        dicts = [d for d in self.dictionaries.dicts if d.path != path]
        if len(dicts) == len(self.dictionaries.dicts):
            raise ValueError(f"Dictionary not found: {path}")
        
        self.dictionaries.set_dicts(dicts)
        return {"status": "ok", "path": path}
    
    def _add_entry(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Add an entry to a dictionary."""
        stroke = params.get("stroke")
        translation = params.get("translation")
        path = params.get("path")  # Optional, uses first writable if not specified
        
        if not stroke or not translation:
            raise ValueError("Both stroke and translation are required")
        
        # Normalize stroke
        stroke_tuple = Stroke.normalize_steno(stroke)
        
        if path:
            dictionary = self.dictionaries.get(path)
            if dictionary is None:
                raise ValueError(f"Dictionary not found: {path}")
        else:
            dictionary = self.dictionaries.first_writable()
        
        if dictionary.readonly:
            raise ValueError(f"Dictionary is read-only: {dictionary.path}")
        
        dictionary[stroke_tuple] = translation
        dictionary.save()
        
        return {"status": "ok", "stroke": "/".join(stroke_tuple), "translation": translation}
    
    def _remove_entry(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Remove an entry from a dictionary."""
        stroke = params.get("stroke")
        path = params.get("path")  # Optional
        
        if not stroke:
            raise ValueError("Stroke is required")
        
        stroke_tuple = Stroke.normalize_steno(stroke)
        
        if path:
            dictionary = self.dictionaries.get(path)
            if dictionary is None:
                raise ValueError(f"Dictionary not found: {path}")
            if dictionary.readonly:
                raise ValueError(f"Dictionary is read-only: {path}")
            if stroke_tuple not in dictionary:
                raise ValueError(f"Entry not found: {stroke}")
            del dictionary[stroke_tuple]
            dictionary.save()
        else:
            # Find and remove from first dictionary that has it
            found = False
            for dictionary in self.dictionaries.dicts:
                if stroke_tuple in dictionary:
                    if dictionary.readonly:
                        continue
                    del dictionary[stroke_tuple]
                    dictionary.save()
                    found = True
                    break
            if not found:
                raise ValueError(f"Entry not found or all dictionaries are read-only: {stroke}")
        
        return {"status": "ok", "stroke": "/".join(stroke_tuple)}
    
    def _update_entry(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Update an entry in a dictionary."""
        stroke = params.get("stroke")
        translation = params.get("translation")
        path = params.get("path")
        
        if not stroke or not translation:
            raise ValueError("Both stroke and translation are required")
        
        stroke_tuple = Stroke.normalize_steno(stroke)
        
        if path:
            dictionary = self.dictionaries.get(path)
            if dictionary is None:
                raise ValueError(f"Dictionary not found: {path}")
        else:
            # Find first dictionary that has this entry
            dictionary = None
            for d in self.dictionaries.dicts:
                if stroke_tuple in d:
                    dictionary = d
                    break
            if dictionary is None:
                raise ValueError(f"Entry not found: {stroke}")
        
        if dictionary.readonly:
            raise ValueError(f"Dictionary is read-only: {dictionary.path}")
        
        dictionary[stroke_tuple] = translation
        dictionary.save()
        
        return {"status": "ok", "stroke": "/".join(stroke_tuple), "translation": translation}
    
    def _lookup(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Lookup a stroke in dictionaries."""
        stroke = params.get("stroke")
        if not stroke:
            raise ValueError("Stroke is required")
        
        stroke_tuple = Stroke.normalize_steno(stroke)
        translation = self.dictionaries.lookup(stroke_tuple)
        
        return {
            "stroke": "/".join(stroke_tuple),
            "translation": translation,
        }
    
    def _reverse_lookup(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Reverse lookup a translation."""
        translation = params.get("translation")
        if not translation:
            raise ValueError("Translation is required")
        
        strokes = self.dictionaries.reverse_lookup(translation)
        
        return {
            "translation": translation,
            "strokes": ["/".join(s) for s in strokes],
        }
    
    def _list_dictionaries(self) -> Dict[str, Any]:
        """List all loaded dictionaries."""
        dicts = []
        for d in self.dictionaries.dicts:
            dicts.append({
                "path": d.path,
                "enabled": d.enabled,
                "readonly": d.readonly,
                "entries": len(d),
            })
        return {"dictionaries": dicts}
    
    def _get_dictionary_entries(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get all entries from a dictionary."""
        path = params.get("path")
        if not path:
            raise ValueError("Dictionary path is required")
        
        dictionary = self.dictionaries.get(path)
        if dictionary is None:
            raise ValueError(f"Dictionary not found: {path}")
        
        entries = []
        for stroke_tuple, translation in dictionary.items():
            entries.append({
                "stroke": "/".join(stroke_tuple),
                "translation": translation,
            })
        
        return {"path": path, "entries": entries}


def main():
    """Main entry point for stripped plover."""
    engine = StrippedPlover()
    
    # Print ready message
    print(json.dumps({"status": "ready"}), flush=True)
    
    # Read and process JSON lines from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = {
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {e}"}
            }
            print(json.dumps(response), flush=True)
            continue
        
        response = engine.handle_request(request)
        quit_flag = response.pop("quit", False)
        print(json.dumps(response), flush=True)
        
        if quit_flag:
            break


if __name__ == "__main__":
    main()
