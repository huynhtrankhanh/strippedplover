/**
 * DictionaryLookup Component - Add/edit/lookup dictionary entries
 */

import { useState } from 'react';
import './DictionaryLookup.css';

interface DictionaryLookupProps {
  onLookup: (stroke: string) => Promise<string | null>;
  onReverseLookup: (translation: string) => Promise<string[]>;
  onAddEntry: (stroke: string, translation: string) => void;
  onRemoveEntry: (stroke: string) => void;
}

export function DictionaryLookup({
  onLookup,
  onReverseLookup,
  onAddEntry,
  onRemoveEntry,
}: DictionaryLookupProps) {
  const [mode, setMode] = useState<'lookup' | 'reverse' | 'add'>('lookup');
  const [input, setInput] = useState('');
  const [translation, setTranslation] = useState('');
  const [result, setResult] = useState<string | string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const handleLookup = async () => {
    setError(null);
    setResult(null);
    
    if (!input.trim()) {
      setError('Please enter a stroke');
      return;
    }
    
    try {
      const found = await onLookup(input.trim().toUpperCase());
      setResult(found ?? 'No translation found');
    } catch (err) {
      setError(String(err));
    }
  };
  
  const handleReverseLookup = async () => {
    setError(null);
    setResult(null);
    
    if (!input.trim()) {
      setError('Please enter a translation');
      return;
    }
    
    try {
      const strokes = await onReverseLookup(input.trim());
      setResult(strokes.length > 0 ? strokes : ['No strokes found']);
    } catch (err) {
      setError(String(err));
    }
  };
  
  const handleAdd = () => {
    setError(null);
    
    if (!input.trim()) {
      setError('Please enter a stroke');
      return;
    }
    
    if (!translation.trim()) {
      setError('Please enter a translation');
      return;
    }
    
    try {
      onAddEntry(input.trim().toUpperCase(), translation.trim());
      setInput('');
      setTranslation('');
      setResult('Entry added successfully');
    } catch (err) {
      setError(String(err));
    }
  };
  
  const handleRemove = () => {
    setError(null);
    
    if (!input.trim()) {
      setError('Please enter a stroke to remove');
      return;
    }
    
    try {
      onRemoveEntry(input.trim().toUpperCase());
      setInput('');
      setResult('Entry removed successfully');
    } catch (err) {
      setError(String(err));
    }
  };
  
  return (
    <div className="dictionary-lookup">
      <div className="lookup-tabs">
        <button
          className={`lookup-tab ${mode === 'lookup' ? 'active' : ''}`}
          onClick={() => { setMode('lookup'); setResult(null); setError(null); }}
        >
          Lookup
        </button>
        <button
          className={`lookup-tab ${mode === 'reverse' ? 'active' : ''}`}
          onClick={() => { setMode('reverse'); setResult(null); setError(null); }}
        >
          Reverse
        </button>
        <button
          className={`lookup-tab ${mode === 'add' ? 'active' : ''}`}
          onClick={() => { setMode('add'); setResult(null); setError(null); }}
        >
          Add/Edit
        </button>
      </div>
      
      <div className="lookup-form">
        <input
          type="text"
          className="lookup-input"
          placeholder={mode === 'reverse' ? 'Enter translation...' : 'Enter stroke (e.g., STKPWHR)...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (mode === 'lookup') handleLookup();
              else if (mode === 'reverse') handleReverseLookup();
              else if (translation) handleAdd();
            }
          }}
        />
        
        {mode === 'add' && (
          <input
            type="text"
            className="lookup-input"
            placeholder="Enter translation..."
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input) handleAdd();
            }}
          />
        )}
        
        <div className="lookup-actions">
          {mode === 'lookup' && (
            <button className="btn btn-primary" onClick={handleLookup}>
              Lookup
            </button>
          )}
          {mode === 'reverse' && (
            <button className="btn btn-primary" onClick={handleReverseLookup}>
              Search
            </button>
          )}
          {mode === 'add' && (
            <>
              <button className="btn btn-primary" onClick={handleAdd}>
                Add Entry
              </button>
              <button className="btn btn-danger" onClick={handleRemove}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
      
      {error && <div className="lookup-error">{error}</div>}
      
      {result && (
        <div className="lookup-result">
          {Array.isArray(result) ? (
            <ul>
              {result.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <div>{result}</div>
          )}
        </div>
      )}
    </div>
  );
}
