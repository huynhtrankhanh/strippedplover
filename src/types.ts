/**
 * Stripped Plover - STDIO-based Stenography Translation Engine
 * Core types and interfaces
 */

// ============================================================================
// Steno System Types
// ============================================================================

export interface StenoSystem {
  name: string;
  keys: readonly string[];
  implicitHyphenKeys: Set<string>;
  numberKey: string | null;
  numbers: Map<string, string>;
  feralNumberKey: boolean;
  suffixKeys: readonly string[];
  undoStrokeSteno: string;
  orthographyRules: Array<[RegExp, string]>;
  orthographyRulesAliases: Map<string, string>;
  orthographyWords: Map<string, number>;
}

// ============================================================================
// Stroke Types
// ============================================================================

export interface StrokeHelper {
  setup(
    keys: readonly string[],
    implicitHyphenKeys: Set<string>,
    numberKey: string | null,
    numbers: Map<string, string>,
    feralNumberKey: boolean
  ): void;
  strokeFromSteno(steno: string): number;
  strokeFromKeys(keys: string[]): number;
  strokeFromInt(integer: number): number;
  strokeToSteno(stroke: number): string;
  strokeToKeys(stroke: number): string[];
  normalizeStroke(steno: string): string;
  normalizeSteno(steno: string): string[];
  stenoToSortKey(steno: string): string;
}

// ============================================================================
// Dictionary Types
// ============================================================================

export interface DictionaryEntry {
  stroke: string;
  translation: string;
}

export interface DictionaryInfo {
  identifier: string;
  enabled: boolean;
  entries: number;
}

// ============================================================================
// Translation Types
// ============================================================================

export interface Translation {
  strokes: Stroke[];
  rtfcre: string[];
  english: string | null;
  replaced: Translation[];
  formatting: Action[];
  isRetrospectiveCommand: boolean;
}

export interface Stroke {
  value: number;
  rtfcre: string;
  stenoKeys: string[];
  isCorrection: boolean;
}

// ============================================================================
// Formatting Types
// ============================================================================

export enum Case {
  CAP_FIRST_WORD = 'cap_first_word',
  LOWER = 'lower',
  LOWER_FIRST_CHAR = 'lower_first_char',
  TITLE = 'title',
  UPPER = 'upper',
  UPPER_FIRST_WORD = 'upper_first_word',
}

export interface Action {
  // Previous
  prevAttach: boolean;
  prevReplace: string;
  // Current
  glue: boolean;
  word: string | null;
  orthography: boolean;
  spaceChar: string;
  upperCarry: boolean;
  case: Case | null;
  text: string | null;
  trailingSpace: string;
  wordIsFinished: boolean;
  combo: string | null;
  command: string | null;
  // Next
  nextAttach: boolean;
  nextCase: Case | null;
}

// ============================================================================
// Output Types
// ============================================================================

export interface CommittedOutput {
  type: 'committed';
  text: string;
}

export interface KeypressOutput {
  type: 'keypress';
  combo: string;
}

export interface PreeditOutput {
  type: 'preedit';
  text: string;
}

export type OutputElement = CommittedOutput | KeypressOutput | PreeditOutput;

// ============================================================================
// Protocol Types
// ============================================================================

export interface ProtocolRequest {
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface ProtocolSuccessResponse {
  id: string | number | null;
  result: Record<string, unknown>;
}

export interface ProtocolErrorResponse {
  id: string | number | null;
  error: {
    code: number;
    message: string;
  };
}

export type ProtocolResponse = ProtocolSuccessResponse | ProtocolErrorResponse;

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  PARSE_ERROR: -32700,
  UNKNOWN_METHOD: -32601,
  GENERAL_ERROR: -32000,
} as const;

// ============================================================================
// Starting Stroke State
// ============================================================================

export interface StartingStrokeState {
  attach: boolean;
  capitalize: boolean;
  spaceChar: string;
}

export const DEFAULT_STARTING_STROKE_STATE: StartingStrokeState = {
  attach: true,
  capitalize: false,
  spaceChar: ' ',
};
