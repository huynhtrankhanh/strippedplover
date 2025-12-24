pub mod dictionary_collection;

use crate::stroke::Stroke;
use crate::translation::dictionary_collection::StenoDictionaryCollection;
use crate::formatting::Action; // Need formatting Action type

#[derive(Clone, Debug)]
pub struct Translation {
    pub strokes: Vec<Stroke>,
    pub rtfcre: Vec<String>,
    pub english: Option<String>,
    pub replaced: Vec<Translation>,
    pub formatting: Vec<Action>,
}

impl Translation {
    pub fn new(strokes: Vec<Stroke>, translation: Option<String>) -> Self {
        let rtfcre = strokes.iter().map(|s| s.to_rtfcre()).collect();
        Translation {
            strokes,
            rtfcre,
            english: translation,
            replaced: Vec::new(),
            formatting: Vec::new(),
        }
    }

    pub fn length(&self) -> usize {
        self.strokes.len()
    }
}

pub struct TranslatorState {
    pub translations: Vec<Translation>,
    pub tail: Option<Translation>,
}

impl Default for TranslatorState {
    fn default() -> Self {
        Self::new()
    }
}

impl TranslatorState {
    pub fn new() -> Self {
        TranslatorState {
            translations: Vec::new(),
            tail: None,
        }
    }

    pub fn restrict_size(&mut self, n: usize) {
        let mut stroke_count = 0;
        let mut translation_count = 0;

        for i in (0..self.translations.len()).rev() {
            stroke_count += self.translations[i].length();
            translation_count += 1;
            if stroke_count >= n {
                break;
            }
        }

        let translation_index = self.translations.len().saturating_sub(translation_count);
        if translation_index > 0 {
             if translation_index >= 1 {
                 self.tail = Some(self.translations[translation_index - 1].clone());
             }
             self.translations.drain(0..translation_index);
        }
    }
}

pub struct Translator {
    dictionary: StenoDictionaryCollection,
    pub state: TranslatorState, // Made public for Engine access
    undo_length: usize,
    to_undo: Vec<Translation>,
    to_do: usize,
}

impl Default for Translator {
    fn default() -> Self {
        Self::new()
    }
}

impl Translator {
    pub fn new() -> Self {
        Translator {
            dictionary: StenoDictionaryCollection::new(),
            state: TranslatorState::new(),
            undo_length: 0,
            to_undo: Vec::new(),
            to_do: 0,
        }
    }

    pub fn set_dictionary(&mut self, dictionary: StenoDictionaryCollection) {
        self.dictionary = dictionary;
    }

    pub fn translate(&mut self, stroke: Stroke) {
        self.translate_stroke(stroke);
    }

    fn translate_stroke(&mut self, stroke: Stroke) {
        let max_len = self.dictionary.longest_key();

        // Match logic
        if let Some(t) = self.find_longest_match(2, max_len, stroke) {
            self.translate_translation(t);
            return;
        }

        if let Some(t) = self.find_longest_match(1, max_len, stroke) {
             self.translate_translation(t);
             return;
        }

        // Fallback
        let t = Translation::new(vec![stroke], None);
        self.translate_translation(t);
    }

    fn find_longest_match(&self, min_len: usize, max_len: usize, stroke: Stroke) -> Option<Translation> {
        let mut num_strokes = 1;
        let mut translation_count = 0;

        for i in (0..self.state.translations.len()).rev() {
            num_strokes += self.state.translations[i].length();
            if num_strokes > max_len {
                break;
            }
            translation_count += 1;
        }

        let translation_index = self.state.translations.len().saturating_sub(translation_count);
        let translations = &self.state.translations[translation_index..];

        for i in 0..=translations.len() {
            let replaced = &translations[i..];
            let mut strokes = Vec::new();
            for t in replaced {
                strokes.extend(t.strokes.iter().cloned());
            }
            strokes.push(stroke);

            if strokes.len() < min_len {
                continue;
            }

            // Lookup
            let steno_keys: Vec<String> = strokes.iter().map(|s| s.to_rtfcre()).collect();
            if let Some(mapping) = self.dictionary.lookup(&steno_keys) {
                let mut t = Translation::new(strokes, Some(mapping));
                t.replaced = replaced.to_vec();
                return Some(t);
            }
        }

        None
    }

    fn translate_translation(&mut self, t: Translation) {
        self.undo(&t.replaced);
        self.do_translation(t);
    }

    fn undo(&mut self, translations: &[Translation]) {
        for t in translations.iter().rev() {
             if let Some(_last) = self.state.translations.pop() {
                 // Check mismatch?
             }
             if self.to_do > 0 {
                 self.to_do -= 1;
             } else {
                 self.to_undo.insert(0, t.clone());
             }
        }
    }

    fn do_translation(&mut self, t: Translation) {
        self.state.translations.push(t);
        self.to_do += 1;
    }

    pub fn flush(&mut self) -> (Vec<Translation>, Vec<Translation>) {
        let undo = std::mem::take(&mut self.to_undo);
        let do_translations: Vec<Translation> = self.state.translations.iter().rev().take(self.to_do).cloned().collect();
        let do_translations: Vec<Translation> = do_translations.into_iter().rev().collect();

        self.to_do = 0;
        self.state.restrict_size(self.dictionary.longest_key().max(self.undo_length));

        (undo, do_translations)
    }

    pub fn clear_state(&mut self) {
        self.state = TranslatorState::new();
        self.to_undo.clear();
        self.to_do = 0;
    }
}
