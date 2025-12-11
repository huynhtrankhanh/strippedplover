/**
 * Meta Module Index
 * 
 * Registers all built-in meta handlers.
 */

import { registry } from '../registry.js';
import { metaAttach, metaCarryCapitalize } from './attach.js';
import { metaCase, metaRetroCase } from './case.js';
import { metaCommand } from './command.js';
import { metaGlue } from './glue.js';
import { metaKeyCombo } from './key-combo.js';
import { metaMode } from './mode.js';
import { metaComma, metaStop } from './punctuation.js';
import { metaRetroCurrency } from './currency.js';
import { metaWordEnd } from './word-end.js';
import { metaIfNextMatches } from './conditional.js';

/**
 * Register all built-in meta handlers
 */
export function registerMetas(): void {
  registry.registerPlugin('meta', 'attach', metaAttach);
  registry.registerPlugin('meta', 'carry_capitalize', metaCarryCapitalize);
  registry.registerPlugin('meta', 'case', metaCase);
  registry.registerPlugin('meta', 'retro_case', metaRetroCase);
  registry.registerPlugin('meta', 'command', metaCommand);
  registry.registerPlugin('meta', 'glue', metaGlue);
  registry.registerPlugin('meta', 'key_combo', metaKeyCombo);
  registry.registerPlugin('meta', 'mode', metaMode);
  registry.registerPlugin('meta', 'comma', metaComma);
  registry.registerPlugin('meta', 'stop', metaStop);
  registry.registerPlugin('meta', 'retro_currency', metaRetroCurrency);
  registry.registerPlugin('meta', 'word_end', metaWordEnd);
  registry.registerPlugin('meta', 'if_next_matches', metaIfNextMatches);
}

// Export all meta handlers
export { metaAttach, metaCarryCapitalize } from './attach.js';
export { metaCase, metaRetroCase } from './case.js';
export { metaCommand } from './command.js';
export { metaGlue } from './glue.js';
export { metaKeyCombo } from './key-combo.js';
export { metaMode } from './mode.js';
export { metaComma, metaStop } from './punctuation.js';
export { metaRetroCurrency } from './currency.js';
export { metaWordEnd } from './word-end.js';
export { metaIfNextMatches, LookAheadAction } from './conditional.js';
