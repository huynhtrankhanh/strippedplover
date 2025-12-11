"""
Stripped Plover - STDIO-based stenography translation engine.

This module implements the MANIFESTO.md requirements:
1. No external dependencies (minimal)
2. No UI
3. No keyboard capture
4. STDIO-based JSON line protocol
5. Dictionary management and stateful translation

The output model uses a structured array response for IME integration:
- Translation responses contain an array of elements:
  - {"type": "committed", "text": "..."} - Text that was finalized
  - {"type": "keypress", "combo": "..."} - Literal key combination to execute
  - {"type": "preedit", "text": "..."} - Current uncommitted text

Key combinations force a commit of the previous preedit.
Commitment is not an externally triggered event.
"""

import json
import sys
import os
from collections import namedtuple
from typing import Dict, List, Optional, Any, Union

# Core Plover imports
from plover.steno import Stroke
from plover.steno_dictionary import StenoDictionary, StenoDictionaryCollection
from plover.translation import Translator, Translation
from plover.formatting import Formatter, _Action, RetroFormatter
from plover import system
from plover.registry import registry


# Engine state similar to Plover's StartingStrokeState
# By default, attach=True to suppress initial space on start/reset
StartingStrokeState = namedtuple(
    "StartingStrokeState", "attach capitalize space_char", defaults=(True, False, " ")
)


class TranslationOutputHandler:
    """
    Output handler that produces structured translation output for IME integration.
    
    This handler tracks the full text state and produces an array of elements:
    - committed: Text that was finalized (before key combinations)
    - keypress: Literal key combinations to execute
    - preedit: Current uncommitted text
    
    Key combinations force a commit of any pending preedit text before the keypress.
    """
    
    def __init__(self, engine: 'StrippedPlover'):
        self._engine = engine
        self.reset_all()
    
    def reset_all(self):
        """Reset all state to initial."""
        self._current_text = ""  # Full current uncommitted text
        self._output_elements = []  # Array of output elements
        self._is_initial = True  # Whether we're at initial state (no space prefix)
    
    def reset_stroke_output(self):
        """Reset per-stroke output capture."""
        self._output_elements = []
    
    def send_backspaces(self, count: int):
        """Handle backspaces by removing from current text."""
        if count > 0:
            self._current_text = self._current_text[:-count]
    
    def send_string(self, text: str):
        """Append text to current output."""
        self._current_text += text
    
    def send_key_combination(self, combo: str):
        """
        Record a key combination.
        
        Key combinations force a commit of any pending preedit text,
        then the keypress is recorded.
        """
        # Commit any pending preedit before the keypress
        if self._current_text:
            self._output_elements.append({
                "type": "committed",
                "text": self._current_text
            })
            self._current_text = ""
            # After committing, we're no longer in initial state
            self._is_initial = False
        
        # Record the keypress
        self._output_elements.append({
            "type": "keypress",
            "combo": combo
        })
    
    def send_engine_command(self, command: str):
        """Handle engine commands."""
        self._engine._handle_engine_command(command)
    
    def get_output_elements(self) -> List[Dict[str, Any]]:
        """Get the structured output elements including current preedit."""
        elements = list(self._output_elements)
        
        # Add current preedit as the final element if there is any
        if self._current_text:
            elements.append({
                "type": "preedit",
                "text": self._current_text
            })
        
        return elements
    
    def is_initial(self) -> bool:
        """Check if we're at initial state (no output yet)."""
        return self._is_initial
    
    def mark_not_initial(self):
        """Mark that we've produced output (no longer initial)."""
        self._is_initial = False


class StrippedPlover:
    """
    Main stripped plover engine.
    
    Provides stateful stenography translation with structured output
    suitable for IME integration.
    
    Engine state affects capitalization and space output:
    - start_attached: Whether to suppress initial space
    - start_capitalized: Whether to capitalize first word
    - space_char: Character to use for spaces
    
    Engine commands are supported (except TOGGLE, STOP, RESUME which
    don't make sense in this context).
    """
    
    # Commands that are not supported in stripped plover
    UNSUPPORTED_COMMANDS = {'toggle', 'stop', 'resume', 'suspend', 'quit'}
    
    def __init__(self):
        self.dictionaries: StenoDictionaryCollection = StenoDictionaryCollection()
        self.translator: Translator = Translator()
        self.formatter: Formatter = Formatter()
        self.output: TranslationOutputHandler = TranslationOutputHandler(self)
        
        # Engine state - controls capitalization and space output
        self._starting_stroke_state = StartingStrokeState()
        
        # Setup the system
        self._setup_system()
        
        # Apply initial engine state to formatter
        self._apply_starting_stroke_state()
        
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
    
    def _apply_starting_stroke_state(self):
        """Apply the starting stroke state to the formatter."""
        self.formatter.start_attached = self._starting_stroke_state.attach
        self.formatter.start_capitalized = self._starting_stroke_state.capitalize
        self.formatter.space_char = self._starting_stroke_state.space_char
    
    @property
    def starting_stroke_state(self) -> StartingStrokeState:
        """Get the current starting stroke state."""
        return self._starting_stroke_state
    
    @starting_stroke_state.setter
    def starting_stroke_state(self, state: StartingStrokeState):
        """Set the starting stroke state."""
        self._starting_stroke_state = state
        self._apply_starting_stroke_state()
    
    def _handle_engine_command(self, command: str):
        """
        Handle engine commands from translations.
        
        Supported commands:
        - SUSPEND, RESUME, TOGGLE, QUIT: Not supported (no-op)
        - SET_CONFIG: Modify engine configuration
        - Other commands: Look up in registry and execute
        """
        command_name, *command_args = command.split(":", 1)
        command_name = command_name.lower()
        
        # Skip unsupported commands
        if command_name in self.UNSUPPORTED_COMMANDS:
            return
        
        # Handle SET_CONFIG command
        if command_name == "set_config":
            if command_args:
                self._handle_set_config(command_args[0])
            return
        
        # Try to look up the command in the registry
        try:
            command_fn = registry.get_plugin("command", command_name).obj
            command_fn(self, command_args[0] if command_args else "")
        except KeyError:
            # Unknown command, ignore
            pass
    
    def _handle_set_config(self, cmdline: str):
        """
        Handle SET_CONFIG command.
        
        Supports setting:
        - start_attached: bool
        - start_capitalized: bool
        - space_char: str
        """
        import ast
        try:
            opt_dict = ast.literal_eval("{" + cmdline + "}")
            if not isinstance(opt_dict, dict):
                return
            
            # Extract supported options
            attach = opt_dict.get('start_attached', self._starting_stroke_state.attach)
            capitalize = opt_dict.get('start_capitalized', self._starting_stroke_state.capitalize)
            space_char = opt_dict.get('space_char', self._starting_stroke_state.space_char)
            
            # Update state
            self.starting_stroke_state = StartingStrokeState(attach, capitalize, space_char)
        except (SyntaxError, ValueError):
            # Invalid syntax, ignore
            pass
    
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle a single JSON request and return a response."""
        request_id = request.get("id")
        method = request.get("method", "")
        params = request.get("params", {})
        
        try:
            if method == "translate":
                result = self._translate(params)
            elif method == "reset_state":
                result = self._reset_state()
            elif method == "set_starting_stroke_state":
                result = self._set_starting_stroke_state(params)
            elif method == "get_starting_stroke_state":
                result = self._get_starting_stroke_state()
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
        
        Returns an array of output elements:
        - {"type": "committed", "text": "..."} - Text that was finalized
        - {"type": "keypress", "combo": "..."} - Literal key combination to execute  
        - {"type": "preedit", "text": "..."} - Current uncommitted text
        
        Key combinations force a commit of any pending preedit text.
        """
        stroke_str = params.get("stroke", "")
        
        # Reset per-stroke output capture (but keep preedit state)
        self.output.reset_stroke_output()
        
        # Create stroke and translate
        stroke = Stroke.from_steno(stroke_str)
        self.translator.translate(stroke)
        
        # Mark that we're no longer at initial state if we produced output
        elements = self.output.get_output_elements()
        if elements:
            self.output.mark_not_initial()
        
        return {
            "output": elements,
        }
    
    def _reset_state(self) -> Dict[str, Any]:
        """
        Reset the translation state completely.
        
        This clears the translator state, the preedit buffer, and resets
        the engine to initial state (no initial space will be emitted).
        Use this when focus changes or starting a new input context.
        """
        self.translator.clear_state()
        self.output.reset_all()
        # Re-apply starting stroke state to formatter
        self._apply_starting_stroke_state()
        return {"status": "ok"}
    
    def _set_starting_stroke_state(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Set the starting stroke state.
        
        This controls:
        - attach: Whether to suppress the initial space (default: False)
        - capitalize: Whether to capitalize the first word (default: False)
        - space_char: Character to use for spaces (default: " ")
        """
        attach = params.get("attach", self._starting_stroke_state.attach)
        capitalize = params.get("capitalize", self._starting_stroke_state.capitalize)
        space_char = params.get("space_char", self._starting_stroke_state.space_char)
        
        self.starting_stroke_state = StartingStrokeState(attach, capitalize, space_char)
        
        return {
            "status": "ok",
            "attach": self._starting_stroke_state.attach,
            "capitalize": self._starting_stroke_state.capitalize,
            "space_char": self._starting_stroke_state.space_char,
        }
    
    def _get_starting_stroke_state(self) -> Dict[str, Any]:
        """Get the current starting stroke state."""
        return {
            "attach": self._starting_stroke_state.attach,
            "capitalize": self._starting_stroke_state.capitalize,
            "space_char": self._starting_stroke_state.space_char,
        }
    
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
