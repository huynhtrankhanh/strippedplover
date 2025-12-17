/**
 * StrokeDisplay Component - Shows recent strokes
 */

import './StrokeDisplay.css';

interface StrokeDisplayProps {
  strokes: Array<{ stroke: string; translation: string | null }>;
}

export function StrokeDisplay({ strokes }: StrokeDisplayProps) {
  return (
    <div className="stroke-display">
      <h3 className="stroke-display-title">Recent Strokes</h3>
      <div className="stroke-list">
        {strokes.length === 0 ? (
          <div className="stroke-empty">No strokes yet</div>
        ) : (
          strokes.slice(-10).reverse().map((item, index) => (
            <div key={index} className="stroke-item">
              <span className="stroke-keys">{item.stroke}</span>
              {item.translation && (
                <span className="stroke-translation">→ {item.translation}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
