/**
 * Undo Macro
 * 
 * Handles the * (asterisk) undo stroke.
 */

import { Translator, Translation } from '../translation.js';
import { Stroke } from '../stroke.js';

// Platform-specific back string
const PLATFORM = process.platform;
const BACK_STRING = PLATFORM === 'darwin'
  ? '{#Alt_L(BackSpace)}{^}'
  : '{#Control_L(BackSpace)}{^}';

/**
 * Undo the last translation
 */
export function undo(translator: Translator, stroke: Stroke, cmdline: string): void {
  if (cmdline) {
    throw new Error('undo macro does not accept arguments');
  }

  const state = translator.getState();
  const translations = state.translations;

  for (let i = translations.length - 1; i >= 0; i--) {
    const t = translations[i];
    translator.untranslateTranslation(t);
    if (t.hasUndo()) {
      return;
    }
  }

  // No more buffer to delete from - send platform-specific back command
  translator.flush([new Translation([stroke], BACK_STRING)]);
}
