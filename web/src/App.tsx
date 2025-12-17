import { useState } from 'react'
import { useStenoEngine } from './hooks'
import { Notepad, StrokeDisplay, SettingsPanel, DictionaryLookup, StatusBar } from './components'
import './App.css'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showLookup, setShowLookup] = useState(false)
  
  const {
    text,
    setText,
    strokeHistory,
    machineState,
    startCapture,
    stopCapture,
    resetState,
    s1AsNumberKey,
    setS1AsNumberKey,
    dictionaries,
    importDictionary,
    exportDictionary,
    removeDictionary,
    setDictionaryEnabled,
    prioritizeDictionaries,
    addEntry,
    removeEntry,
    lookup,
    reverseLookup,
  } = useStenoEngine({ autoStart: true, s1AsNumberKey: true })
  
  return (
    <div className="app">
      <header className="app-header">
        <h1>Steno Notepad</h1>
        <p className="app-subtitle">Stenography-powered writing</p>
      </header>
      
      <main className="app-main">
        <StatusBar
          machineState={machineState}
          onStartCapture={startCapture}
          onStopCapture={stopCapture}
          onReset={resetState}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        
        <div className="app-content">
          <div className="app-editor">
            <Notepad
              value={text}
              onChange={setText}
              placeholder="Start typing with your steno keyboard... Press Q for # (number key) by default."
            />
          </div>
          
          <div className="app-sidebar">
            <StrokeDisplay strokes={strokeHistory} />
            
            <button 
              className="lookup-toggle"
              onClick={() => setShowLookup(!showLookup)}
            >
              {showLookup ? 'Hide' : 'Show'} Dictionary Lookup
            </button>
            
            {showLookup && (
              <DictionaryLookup
                onLookup={lookup}
                onReverseLookup={reverseLookup}
                onAddEntry={addEntry}
                onRemoveEntry={removeEntry}
              />
            )}
          </div>
        </div>
      </main>
      
      <footer className="app-footer">
        <p>
          S1- as # key: <strong>{s1AsNumberKey ? 'ON' : 'OFF'}</strong> | 
          Use your QWERTY keyboard for steno input | 
          <button className="link-btn" onClick={() => setSettingsOpen(true)}>Settings</button>
        </p>
      </footer>
      
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        s1AsNumberKey={s1AsNumberKey}
        onS1AsNumberKeyChange={setS1AsNumberKey}
        dictionaries={dictionaries}
        onImportDictionary={importDictionary}
        onRemoveDictionary={removeDictionary}
        onSetDictionaryEnabled={setDictionaryEnabled}
        onPrioritizeDictionaries={prioritizeDictionaries}
        onExportDictionary={exportDictionary}
      />
    </div>
  )
}

export default App
