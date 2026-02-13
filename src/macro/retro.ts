/**
 * Retro Macros
 * 
 * Retrospective editing macros for toggle asterisk, delete/insert space.
 */

import { Translator, Translation } from '../translation.js';
import { Stroke } from '../stroke.js';
import { DerivedText } from '../derived-text.js';

/**
 * Toggle the asterisk on the previous stroke
 */
export function toggleAsterisk(translator: Translator, _stroke: Stroke, cmdline: string): void {
  if (cmdline) {
    throw new Error('retro_toggle_asterisk macro does not accept arguments');
  }

  const state = translator.getState();
  const translations = state.translations;

  if (translations.length === 0) {
    return;
  }

  const t = translations[translations.length - 1];
  translator.untranslateTranslation(t);

  const lastStroke = t.strokes[t.strokes.length - 1];
  const keys = new Set<string>(lastStroke.stenoKeys);

  if (keys.has('*')) {
    keys.delete('*');
  } else {
    keys.add('*');
  }

  const newStroke = Stroke.fromKeys([...keys]);
  translator.translateStroke(newStroke);
}

/**
 * Retrospectively delete space between last two words
 */
export function deleteSpace(translator: Translator, stroke: Stroke, cmdline: string): void {
  if (cmdline) {
    throw new Error('retro_delete_space macro does not accept arguments');
  }

  const state = translator.getState();
  const translations = state.translations;

  if (translations.length < 2) {
    return;
  }

  const replaced = translations.slice(-2);
  
  if (replaced[1].isRetrospectiveCommand) {
    return;
  }

  let chain: DerivedText | null = null;
  let parts = 0;
  for (const t of replaced) {
    if (t.englishDerivation !== null) {
      chain = DerivedText.appendDerivation(chain, t.englishDerivation);
      parts++;
    } else if (t.rtfcre.length === 1 && /^\d+$/.test(t.rtfcre[0])) {
      chain = DerivedText.append(chain, `{&${t.rtfcre[0]}}`);
      parts++;
    }
    if (chain !== null && t !== replaced[replaced.length - 1]) {
      chain = DerivedText.append(chain, '{^~|^}');
    }
  }

  // Only apply when we have both sides of the space (two translated parts).
  if (chain !== null && parts > 1) {
    const newTranslation = new Translation([stroke], chain);
    newTranslation.replaced = replaced;
    newTranslation.isRetrospectiveCommand = true;
    translator.translateTranslation(newTranslation);
  }
}

/**
 * Retrospectively insert space before the last word
 */
export function insertSpace(translator: Translator, stroke: Stroke, cmdline: string): void {
  if (cmdline) {
    throw new Error('retro_insert_space macro does not accept arguments');
  }

  const state = translator.getState();
  const translations = state.translations;

  if (translations.length === 0) {
    return;
  }

  const replaced = translations[translations.length - 1];

  if (replaced.isRetrospectiveCommand) {
    return;
  }

  // Get the text of the last translation and try to split it
  const english = replaced.english;
  if (english === null || english.length < 2) {
    return;
  }

  // Try to insert a space by breaking attachment
  const derivation = DerivedText.appendDerivation(
    DerivedText.append(null, '{ }'),
    replaced.englishDerivation
  );
  const newTranslation = new Translation([stroke], derivation);
  newTranslation.replaced = [replaced];
  newTranslation.isRetrospectiveCommand = true;
  translator.translateTranslation(newTranslation);
}
