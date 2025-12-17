/**
 * Notepad Component - Main text editor for stenography
 */

import { useRef, useEffect } from 'react';
import './Notepad.css';

interface NotepadProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function Notepad({ value, onChange, placeholder = 'Start typing with your steno keyboard...', readOnly = false }: NotepadProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [value]);
  
  return (
    <div className="notepad">
      <textarea
        ref={textareaRef}
        className="notepad-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}
