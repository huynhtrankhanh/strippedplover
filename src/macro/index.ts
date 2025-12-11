/**
 * Macro Module Index
 * 
 * Registers all built-in macro handlers.
 */

import { registry } from '../registry.js';
import { undo } from './undo.js';
import { lastStroke } from './repeat.js';
import { toggleAsterisk, deleteSpace, insertSpace } from './retro.js';

/**
 * Register all built-in macro handlers
 */
export function registerMacros(): void {
  registry.registerPlugin('macro', 'undo', undo);
  registry.registerPlugin('macro', 'repeat_last_stroke', lastStroke);
  registry.registerPlugin('macro', 'retro_toggle_asterisk', toggleAsterisk);
  registry.registerPlugin('macro', 'retro_delete_space', deleteSpace);
  registry.registerPlugin('macro', 'retro_insert_space', insertSpace);
  
  // Aliases for backwards compatibility
  registry.registerPlugin('macro', 'retrospective_toggle_asterisk', toggleAsterisk);
  registry.registerPlugin('macro', 'retrospective_delete_space', deleteSpace);
  registry.registerPlugin('macro', 'retrospective_insert_space', insertSpace);
}

// Export all macro handlers
export { undo } from './undo.js';
export { lastStroke } from './repeat.js';
export { toggleAsterisk, deleteSpace, insertSpace } from './retro.js';
