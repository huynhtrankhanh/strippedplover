/**
 * Repeat Last Stroke Macro
 */

import { Translator } from '../translation.js';
import { Stroke } from '../stroke.js';

/**
 * Repeat the last stroke
 */
export function lastStroke(translator: Translator, _stroke: Stroke, cmdline: string): void {
  if (cmdline) {
    throw new Error('repeat_last_stroke macro does not accept arguments');
  }

  const state = translator.getState();
  const translations = state.translations;

  if (translations.length === 0) {
    return;
  }

  const lastTranslation = translations[translations.length - 1];
  const lastStrokeObj = lastTranslation.strokes[lastTranslation.strokes.length - 1];
  
  // Create a new stroke with the same keys
  const newStroke = new Stroke(lastStrokeObj.stenoKeys);
  translator.translateStroke(newStroke);
}
