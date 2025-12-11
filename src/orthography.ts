/**
 * Orthography Module
 * 
 * Implements English orthographic rules for adding suffixes.
 */

import * as system from './system/index.js';

/**
 * Generate candidates from orthography rules
 */
export function makeCandidatesFromRules(
  word: string,
  suffix: string,
  check: (candidate: string) => boolean = () => true
): string[] {
  const candidates: string[] = [];
  const input = `${word} ^ ${suffix}`;

  for (const [pattern, replacement] of system.ORTHOGRAPHY_RULES) {
    const match = input.match(pattern);
    if (match) {
      // Expand replacement with captured groups
      let expanded = replacement;
      for (let i = 1; i < match.length; i++) {
        expanded = expanded.replace(new RegExp(`\\$${i}`, 'g'), match[i] ?? '');
      }
      if (check(expanded)) {
        candidates.push(expanded);
      }
    }
  }

  return candidates;
}

/**
 * Internal add suffix function
 */
function _addSuffix(word: string, suffix: string): string {
  const inDict = (x: string) => system.ORTHOGRAPHY_WORDS.has(x);

  const candidates: string[] = [];

  // Try alias
  const alias = system.ORTHOGRAPHY_RULES_ALIASES.get(suffix);
  if (alias) {
    candidates.push(...makeCandidatesFromRules(word, alias, inDict));
  }

  // Try simple join if in dictionary
  const simple = word + suffix;
  if (inDict(simple)) {
    candidates.push(simple);
  }

  // Try rules with dict lookup
  candidates.push(...makeCandidatesFromRules(word, suffix, inDict));

  // Sort by prominence in dictionary
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const aVal = system.ORTHOGRAPHY_WORDS.get(a) ?? Infinity;
      const bVal = system.ORTHOGRAPHY_WORDS.get(b) ?? Infinity;
      return aVal - bVal;
    });
    return candidates[0];
  }

  // Try rules without dict lookup
  const rulesOnly = makeCandidatesFromRules(word, suffix);
  if (rulesOnly.length > 0) {
    return rulesOnly[0];
  }

  // Fallback to simple join
  return simple;
}

/**
 * Add a suffix to a word by applying orthographic rules
 * 
 * @param word The base word
 * @param suffix The suffix to add (may include trailing space/content)
 * @returns The word with suffix applied
 */
export function addSuffix(word: string, suffix: string): string {
  // Handle suffix with trailing content
  const sepIndex = suffix.indexOf(' ');
  if (sepIndex !== -1) {
    const actualSuffix = suffix.slice(0, sepIndex);
    const rest = suffix.slice(sepIndex);
    return _addSuffix(word, actualSuffix) + rest;
  }

  return _addSuffix(word, suffix);
}
