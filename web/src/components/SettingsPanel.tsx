/**
 * Settings Panel Component
 */

import { useState, useRef } from 'react';
import type { DictionaryInfo } from '../engine';
import './SettingsPanel.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  s1AsNumberKey: boolean;
  onS1AsNumberKeyChange: (enabled: boolean) => void;
  dictionaries: DictionaryInfo[];
  onImportDictionary: (name: string, data: Record<string, string>, merge: boolean) => void;
  onRemoveDictionary: (name: string) => void;
  onSetDictionaryEnabled: (name: string, enabled: boolean) => void;
  onPrioritizeDictionaries: (names: string[]) => void;
  onExportDictionary: (name: string) => Record<string, string>;
}

export function SettingsPanel({
  isOpen,
  onClose,
  s1AsNumberKey,
  onS1AsNumberKeyChange,
  dictionaries,
  onImportDictionary,
  onRemoveDictionary,
  onSetDictionaryEnabled,
  onPrioritizeDictionaries,
  onExportDictionary,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'dictionaries'>('general');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  if (!isOpen) return null;
  
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      onImportDictionary(file.name, data, false);
    } catch (error) {
      console.error('Failed to import dictionary:', error);
      alert('Failed to import dictionary. Please check the file format.');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleExport = (name: string) => {
    const data = onExportDictionary(name);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.endsWith('.json') ? name : `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const moveDictionary = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...dictionaries.map(d => d.path)];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newOrder.length) return;
    
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    onPrioritizeDictionaries(newOrder);
  };
  
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-tabs">
          <button 
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button 
            className={`settings-tab ${activeTab === 'dictionaries' ? 'active' : ''}`}
            onClick={() => setActiveTab('dictionaries')}
          >
            Dictionaries
          </button>
        </div>
        
        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-section">
              <h3>Keyboard Settings</h3>
              
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={s1AsNumberKey}
                  onChange={(e) => onS1AsNumberKeyChange(e.target.checked)}
                />
                <span className="toggle-label">
                  <strong>S1- as # key</strong>
                  <small>Use the Q key as the number key instead of S-</small>
                </span>
              </label>
            </div>
          )}
          
          {activeTab === 'dictionaries' && (
            <div className="settings-section">
              <div className="dictionary-actions">
                <button 
                  className="btn btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import Dictionary
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileImport}
                  style={{ display: 'none' }}
                />
              </div>
              
              <div className="dictionary-list">
                {dictionaries.length === 0 ? (
                  <div className="dictionary-empty">
                    No dictionaries loaded. Import a dictionary to get started.
                  </div>
                ) : (
                  dictionaries.map((dict, index) => (
                    <div key={dict.path} className="dictionary-item">
                      <div className="dictionary-info">
                        <label className="dictionary-toggle">
                          <input
                            type="checkbox"
                            checked={dict.enabled}
                            onChange={(e) => onSetDictionaryEnabled(dict.path, e.target.checked)}
                          />
                          <span className="dictionary-name">{dict.path}</span>
                        </label>
                        <span className="dictionary-meta">
                          {dict.entries.toLocaleString()} entries
                          {dict.readonly && <span className="badge">Read-only</span>}
                        </span>
                      </div>
                      <div className="dictionary-controls">
                        <button
                          className="btn btn-small"
                          onClick={() => moveDictionary(index, 'up')}
                          disabled={index === 0}
                          title="Move up (higher priority)"
                        >
                          ↑
                        </button>
                        <button
                          className="btn btn-small"
                          onClick={() => moveDictionary(index, 'down')}
                          disabled={index === dictionaries.length - 1}
                          title="Move down (lower priority)"
                        >
                          ↓
                        </button>
                        <button
                          className="btn btn-small"
                          onClick={() => handleExport(dict.path)}
                          title="Export"
                        >
                          📥
                        </button>
                        {!dict.readonly && (
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => onRemoveDictionary(dict.path)}
                            title="Remove"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
