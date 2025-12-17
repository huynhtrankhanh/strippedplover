/**
 * useStenoEngine Hook - React hook for the steno engine
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { stenoEngine, type OutputElement, type DictionaryInfo, type Stroke } from '../engine';
import { 
  QwertyKeyboardMachine, 
  type StenoMachine, 
  type MachineState,
  stenoEmulator,
} from '../machines';

export interface UseStenoEngineOptions {
  autoStart?: boolean;
  s1AsNumberKey?: boolean;
}

export interface UseStenoEngineResult {
  // Text state
  text: string;
  setText: (text: string) => void;
  
  // Stroke history
  strokeHistory: Array<{ stroke: string; translation: string | null }>;
  
  // Machine state
  machine: StenoMachine | null;
  machineState: MachineState;
  
  // Actions
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  resetState: () => void;
  
  // Settings
  s1AsNumberKey: boolean;
  setS1AsNumberKey: (enabled: boolean) => void;
  
  // Dictionary management
  dictionaries: DictionaryInfo[];
  importDictionary: (name: string, data: Record<string, string>, merge?: boolean) => void;
  exportDictionary: (name: string) => Record<string, string>;
  removeDictionary: (name: string) => void;
  setDictionaryEnabled: (name: string, enabled: boolean) => void;
  prioritizeDictionaries: (names: string[]) => void;
  
  // Entry management
  addEntry: (stroke: string, translation: string, dictionaryName?: string) => void;
  removeEntry: (stroke: string, dictionaryName?: string) => void;
  updateEntry: (stroke: string, translation: string, dictionaryName?: string) => void;
  lookup: (stroke: string) => Promise<string | null>;
  reverseLookup: (translation: string) => Promise<string[]>;
}

export function useStenoEngine(options: UseStenoEngineOptions = {}): UseStenoEngineResult {
  const { autoStart = true, s1AsNumberKey: initialS1AsNumberKey = true } = options;
  
  const [text, setText] = useState('');
  const [strokeHistory, setStrokeHistory] = useState<Array<{ stroke: string; translation: string | null }>>([]);
  const [machineState, setMachineState] = useState<MachineState>('stopped');
  const [dictionaries, setDictionaries] = useState<DictionaryInfo[]>([]);
  const [s1AsNumberKey, setS1AsNumberKeyState] = useState(initialS1AsNumberKey);
  
  const machineRef = useRef<StenoMachine | null>(null);
  const textRef = useRef(text);
  
  // Keep textRef in sync
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  
  // Initialize machine
  useEffect(() => {
    const machine = new QwertyKeyboardMachine({ s1AsNumberKey: initialS1AsNumberKey });
    machineRef.current = machine;
    stenoEmulator.setCurrentMachine(machine);
    
    // Handle state changes
    machine.addStateCallback((state) => {
      setMachineState(state);
    });
    
    // Handle strokes
    machine.addStrokeCallback(async (keys) => {
      const stroke = keys.join('');
      const output = await stenoEngine.processStrokeFromKeys(keys);
      
      // Update text based on output
      let newText = textRef.current;
      let translation: string | null = null;
      
      for (const element of output) {
        if (element.type === 'preedit' && element.text) {
          // For preedit, just track what would be typed
          translation = element.text;
        }
      }
      
      // Apply output to text
      for (const element of output) {
        if (element.type === 'committed' && element.text) {
          newText += element.text;
        } else if (element.type === 'preedit' && element.text) {
          newText += element.text;
        }
      }
      
      setText(newText);
      
      // Add to history
      setStrokeHistory(prev => [...prev.slice(-49), { stroke, translation }]);
    });
    
    // Auto-start if requested
    if (autoStart) {
      machine.startCapture().catch(console.error);
    }
    
    // Update dictionaries list
    setDictionaries(stenoEngine.listDictionaries());
    
    return () => {
      machine.stopCapture();
    };
  }, [autoStart, initialS1AsNumberKey]);
  
  const startCapture = useCallback(async () => {
    if (machineRef.current) {
      await machineRef.current.startCapture();
    }
  }, []);
  
  const stopCapture = useCallback(() => {
    if (machineRef.current) {
      machineRef.current.stopCapture();
    }
  }, []);
  
  const resetState = useCallback(() => {
    stenoEngine.resetState();
    setText('');
    setStrokeHistory([]);
  }, []);
  
  const setS1AsNumberKey = useCallback((enabled: boolean) => {
    setS1AsNumberKeyState(enabled);
    if (machineRef.current instanceof QwertyKeyboardMachine) {
      machineRef.current.setS1AsNumberKey(enabled);
    }
  }, []);
  
  // Dictionary management
  const importDictionary = useCallback((name: string, data: Record<string, string>, merge = false) => {
    stenoEngine.importDictionary(name, data, merge);
    setDictionaries(stenoEngine.listDictionaries());
  }, []);
  
  const exportDictionary = useCallback((name: string) => {
    return stenoEngine.exportDictionary(name);
  }, []);
  
  const removeDictionary = useCallback((name: string) => {
    stenoEngine.removeDictionary(name);
    setDictionaries(stenoEngine.listDictionaries());
  }, []);
  
  const setDictionaryEnabled = useCallback((name: string, enabled: boolean) => {
    stenoEngine.setDictionaryEnabled(name, enabled);
    setDictionaries(stenoEngine.listDictionaries());
  }, []);
  
  const prioritizeDictionaries = useCallback((names: string[]) => {
    stenoEngine.prioritizeDictionaries(names);
    setDictionaries(stenoEngine.listDictionaries());
  }, []);
  
  // Entry management
  const addEntry = useCallback((stroke: string, translation: string, dictionaryName?: string) => {
    stenoEngine.addEntry(stroke, translation, dictionaryName);
    setDictionaries(stenoEngine.listDictionaries());
  }, []);
  
  const removeEntry = useCallback((stroke: string, dictionaryName?: string) => {
    stenoEngine.removeEntry(stroke, dictionaryName);
    setDictionaries(stenoEngine.listDictionaries());
  }, []);
  
  const updateEntry = useCallback((stroke: string, translation: string, dictionaryName?: string) => {
    stenoEngine.updateEntry(stroke, translation, dictionaryName);
  }, []);
  
  const lookup = useCallback(async (stroke: string) => {
    return stenoEngine.lookup(stroke);
  }, []);
  
  const reverseLookup = useCallback(async (translation: string) => {
    return stenoEngine.reverseLookup(translation);
  }, []);
  
  return {
    text,
    setText,
    strokeHistory,
    machine: machineRef.current,
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
    updateEntry,
    lookup,
    reverseLookup,
  };
}
