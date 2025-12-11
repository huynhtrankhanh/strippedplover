/**
 * Currency Meta Handler
 * 
 * Handles retro currency formatting.
 */

import { Action, FormatterContext } from '../formatting.js';

/**
 * Handle retro currency meta {*(format)}
 */
export function metaRetroCurrency(ctx: FormatterContext, dictFormat: string): Action {
  const action = ctx.copyLastAction();
  const lastWords = ctx.lastWords(1);

  if (lastWords.length === 0) {
    return action;
  }

  const currency = lastWords[0].replace(/,/g, '');

  // Try to parse as integer first, then float
  const intValue = parseInt(currency, 10);
  const floatValue = parseFloat(currency);

  if (!isNaN(intValue) && currency === intValue.toString()) {
    // Integer value
    const formatted = intValue.toLocaleString('en-US');
    const currencyFormat = dictFormat.replace('c', formatted);
    action.prevAttach = true;
    action.prevReplace = lastWords[0];
    action.text = currencyFormat;
    action.word = null;
  } else if (!isNaN(floatValue)) {
    // Float value
    const formatted = floatValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const currencyFormat = dictFormat.replace('c', formatted);
    action.prevAttach = true;
    action.prevReplace = lastWords[0];
    action.text = currencyFormat;
    action.word = null;
  }

  return action;
}
