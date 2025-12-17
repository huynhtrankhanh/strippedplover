/**
 * StatusBar Component - Shows machine state and controls
 */

import type { MachineState } from '../machines';
import './StatusBar.css';

interface StatusBarProps {
  machineState: MachineState;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
}

export function StatusBar({
  machineState,
  onStartCapture,
  onStopCapture,
  onReset,
  onOpenSettings,
}: StatusBarProps) {
  const getStateColor = () => {
    switch (machineState) {
      case 'connected': return '#22c55e';
      case 'initializing': return '#f59e0b';
      case 'error':
      case 'disconnected': return '#ef4444';
      default: return '#9ca3af';
    }
  };
  
  const getStateText = () => {
    switch (machineState) {
      case 'connected': return 'Connected';
      case 'initializing': return 'Connecting...';
      case 'error': return 'Error';
      case 'disconnected': return 'Disconnected';
      default: return 'Stopped';
    }
  };
  
  return (
    <div className="status-bar">
      <div className="status-info">
        <span 
          className="status-indicator"
          style={{ backgroundColor: getStateColor() }}
        />
        <span className="status-text">{getStateText()}</span>
      </div>
      
      <div className="status-controls">
        {machineState === 'stopped' || machineState === 'disconnected' || machineState === 'error' ? (
          <button className="status-btn" onClick={onStartCapture}>
            ▶ Start
          </button>
        ) : (
          <button className="status-btn" onClick={onStopCapture}>
            ⏹ Stop
          </button>
        )}
        
        <button className="status-btn" onClick={onReset} title="Reset">
          ↺
        </button>
        
        <button className="status-btn" onClick={onOpenSettings} title="Settings">
          ⚙
        </button>
      </div>
    </div>
  );
}
