use regex::Regex;
use lazy_static::lazy_static;
use crate::translation::Translation;
use crate::protocol::OutputElement;

lazy_static! {
    static ref WORD_RX: Regex = Regex::new(r"(?:\d+(?:[.,]\d+)+|['\w]+[-\w']*|[^\w\s]+)\s*").unwrap();
    static ref ATOM_PATTERN: Regex = Regex::new(r"(?:\\\{|\\\}|[^{}])+|\{(?:\\\{|\\\}|[^{}])*\}").unwrap();
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Case {
    CapFirstWord,
    Lower,
    LowerFirstChar,
    Title,
    Upper,
    UpperFirstWord,
}

pub const SPACE: &str = " ";
pub const META_ATTACH_FLAG: char = '^';
pub const META_CARRY_CAPITALIZATION: &str = "~|";
pub const META_GLUE_FLAG: char = '&';
pub const META_START: char = '{';
pub const META_END: char = '}';

#[derive(Clone, Debug)]
pub struct Action {
    pub prev_attach: bool,
    pub prev_replace: String,

    pub glue: bool,
    pub word: Option<String>,
    pub orthography: bool,
    pub space_char: String,
    pub upper_carry: bool,
    pub case: Option<Case>,
    pub text: Option<String>,
    pub trailing_space: String,
    pub word_is_finished: bool,
    pub combo: Option<String>,
    pub command: Option<String>,

    pub next_attach: bool,
    pub next_case: Option<Case>,
}

impl Default for Action {
    fn default() -> Self {
        Action {
            prev_attach: false,
            prev_replace: String::new(),
            glue: false,
            word: None,
            orthography: true,
            space_char: " ".to_string(),
            upper_carry: false,
            case: None,
            text: None,
            trailing_space: String::new(),
            word_is_finished: true,
            combo: None,
            command: None,
            next_attach: false,
            next_case: None,
        }
    }
}

impl Action {
    pub fn new_state(&self) -> Action {
        Action {
            prev_attach: self.next_attach,
            space_char: self.space_char.clone(),
            case: self.case,
            trailing_space: self.trailing_space.clone(),
            ..Default::default()
        }
    }

    pub fn copy_state(&self) -> Action {
        Action {
            prev_attach: self.next_attach,
            case: self.case,
            glue: self.glue,
            orthography: self.orthography,
            space_char: self.space_char.clone(),
            upper_carry: self.upper_carry,
            word: self.word.clone(),
            trailing_space: self.trailing_space.clone(),
            word_is_finished: self.word_is_finished,
            next_attach: self.next_attach,
            next_case: self.next_case,
            ..Default::default()
        }
    }
}

pub struct FormatterContext {
    pub last_action: Action,
    pub translated_actions: Vec<Action>,
}

impl FormatterContext {
    pub fn new(last_action: Action) -> Self {
        FormatterContext {
            last_action,
            translated_actions: Vec::new(),
        }
    }

    pub fn new_action(&self) -> Action {
        self.last_action.new_state()
    }

    pub fn copy_last_action(&self) -> Action {
        self.last_action.copy_state()
    }

    pub fn translated(&mut self, action: Action) {
        self.translated_actions.push(action.clone());
        self.last_action = action;
    }
}

pub fn capitalize_first_word(s: &str) -> String {
    if let Some(c) = s.chars().next() {
        c.to_uppercase().to_string() + &s[c.len_utf8()..]
    } else {
        String::new()
    }
}

pub fn lower_first_character(s: &str) -> String {
    if let Some(c) = s.chars().next() {
        c.to_lowercase().to_string() + &s[c.len_utf8()..]
    } else {
        String::new()
    }
}

pub fn upper_first_word(s: &str) -> String {
    if let Some(mat) = WORD_RX.find(s) {
        let first_word = mat.as_str();
        first_word.to_uppercase() + &s[first_word.len()..]
    } else {
        s.to_string()
    }
}

pub fn rightmost_word(s: &str) -> String {
    let words: Vec<&str> = WORD_RX.find_iter(s).map(|m| m.as_str()).collect();
    if let Some(last_word) = words.last() {
        if last_word.ends_with(' ') || last_word.ends_with('\t') {
            String::new()
        } else {
            last_word.to_string()
        }
    } else {
        String::new()
    }
}

pub fn has_word_boundary(s: &str) -> bool {
    if s.is_empty() { return false; }
    if s.starts_with(char::is_whitespace) || s.ends_with(char::is_whitespace) { return true; }
    WORD_RX.find_iter(s).count() > 1
}

pub fn apply_case(text: &str, case_mode: Option<Case>) -> String {
    match case_mode {
        Some(Case::CapFirstWord) => capitalize_first_word(text),
        Some(Case::LowerFirstChar) => lower_first_character(text),
        Some(Case::UpperFirstWord) => upper_first_word(text),
        _ => text.to_string(),
    }
}

pub fn apply_mode_case(text: &str, case_mode: Option<Case>, appended: bool) -> String {
    match case_mode {
        Some(Case::Lower) => text.to_lowercase(),
        Some(Case::Upper) => text.to_uppercase(),
        Some(Case::Title) => {
            if appended {
                text.to_string()
            } else {
                text.split(' ')
                    .map(|w| {
                        if let Some(c) = w.chars().next() {
                            c.to_uppercase().to_string() + &w[c.len_utf8()..].to_lowercase()
                        } else {
                            String::new()
                        }
                    })
                    .collect::<Vec<String>>()
                    .join(" ")
            }
        }
        _ => text.to_string(),
    }
}

pub struct Formatter {
    pub spaces_after: bool,
    pub last_output_spaces_after: bool,
    pub start_capitalized: bool,
    pub start_attached: bool,
    pub space_char: String,
}

impl Default for Formatter {
    fn default() -> Self {
        Self::new()
    }
}

impl Formatter {
    pub fn new() -> Self {
        Formatter {
            spaces_after: false,
            last_output_spaces_after: false,
            start_capitalized: false,
            start_attached: false,
            space_char: " ".to_string(),
        }
    }

    pub fn reset(&mut self) {
        // Reset state
    }

    pub fn last_action(&self, previous_translations: Option<&Vec<Translation>>) -> Action {
        if let Some(prev) = previous_translations {
            if let Some(last_trans) = prev.last() {
                if let Some(last_fmt) = last_trans.formatting.last() {
                    return last_fmt.clone();
                }
            }
        }

        let mut action = Action::default();
        action.next_attach = self.start_attached || self.spaces_after;
        action.next_case = if self.start_capitalized { Some(Case::CapFirstWord) } else { None };
        action.space_char = self.space_char.clone();
        action
    }

    pub fn format(
        &mut self,
        _undo: Vec<Translation>,
        do_trans: Vec<Translation>,
        prev: Option<Vec<Translation>>,
    ) -> Vec<OutputElement> {
        let mut output_elements = Vec::new();

        let mut new_actions = Vec::new();

        let last_act = self.last_action(prev.as_ref());
        let mut ctx = FormatterContext::new(last_act);

        for t in do_trans {
             let actions = if let Some(english) = &t.english {
                 translation_to_actions(english, &mut ctx)
             } else {
                 // Raw stroke fallback
                 let stroke = t.strokes.first().map(|s| s.to_rtfcre()).unwrap_or_default();
                 let action = raw_to_action(&stroke, &mut ctx);
                 ctx.translated(action.clone());
                 vec![action]
             };
             new_actions.extend(actions);
        }

        let mut text_formatter = TextFormatter::new(self.spaces_after);
        let mut text_buffer = String::new();

        for action in new_actions {
            if let Some(cmd) = &action.command {
                // Flush text
                if !text_buffer.is_empty() {
                    output_elements.push(OutputElement::Preedit { text: text_buffer.clone() });
                    text_buffer.clear();
                }
                // TODO: Handle command
                continue;
            }
            if let Some(combo) = &action.combo {
                if !text_buffer.is_empty() {
                    output_elements.push(OutputElement::Committed { text: text_buffer.clone() });
                    text_buffer.clear();
                }
                output_elements.push(OutputElement::Keypress { combo: combo.clone() });
                continue;
            }

            if let Some(s) = text_formatter.render(&action) {
                text_buffer = s;
            }
        }

        if !text_buffer.is_empty() {
            output_elements.push(OutputElement::Preedit { text: text_buffer });
        }

        output_elements
    }
}

pub struct TextFormatter {
    pub spaces_after: bool,
    pub replaced_text: String,
    pub appended_text: String,
    pub trailing_space: String,
}

impl TextFormatter {
    pub fn new(spaces_after: bool) -> Self {
        TextFormatter {
            spaces_after,
            replaced_text: String::new(),
            appended_text: String::new(),
            trailing_space: String::new(),
        }
    }

    pub fn render(&mut self, action: &Action) -> Option<String> {
        if action.text.is_none() { return Some(self.appended_text.clone()); }

        // Handling backspaces (prev_replace)
        let replace_len = action.prev_replace.len();
        if replace_len > 0 {
            if replace_len <= self.appended_text.len() {
                let new_len = self.appended_text.len() - replace_len;
                self.appended_text.truncate(new_len);
            } else {
                // Backspacing past current buffer
                self.appended_text.clear();
            }
        }

        if !action.prev_attach {
            self.appended_text += &action.space_char;
        }

        if let Some(text) = &action.text {
            self.appended_text += text;
        }

        if self.spaces_after && !action.next_attach {
            self.appended_text += &action.space_char;
            self.trailing_space = action.space_char.clone();
        } else {
            self.trailing_space.clear();
        }

        Some(self.appended_text.clone())
    }
}

fn translation_to_actions(translation: &str, ctx: &mut FormatterContext) -> Vec<Action> {
    let mut actions = Vec::new();
    let atoms: Vec<&str> = ATOM_PATTERN.find_iter(translation).map(|m| m.as_str()).collect();

    if atoms.is_empty() {
        if !translation.is_empty() {
            let action = raw_to_action(translation, ctx);
            actions.push(action.clone());
            ctx.translated(action);
        }
    } else {
        for atom in atoms {
            let action = atom_to_action(atom, ctx);
            actions.push(action.clone());
            ctx.translated(action);
        }
    }
    actions
}

fn raw_to_action(text: &str, ctx: &mut FormatterContext) -> Action {
    let mut action = Action::default();
    action.text = Some(text.to_string());
    action.word = Some(text.to_string());
    action.case = ctx.last_action.case;
    action.prev_attach = ctx.last_action.next_attach;
    action.space_char = ctx.last_action.space_char.clone();
    action.trailing_space = ctx.last_action.space_char.clone();
    finalize_action(&mut action, ctx);
    action
}

fn atom_to_action(atom: &str, ctx: &mut FormatterContext) -> Action {
    let mut action = ctx.new_action();
    if atom.starts_with('{') && atom.ends_with('}') {
        let content = &atom[1..atom.len()-1];
        parse_meta(content, &mut action);
        finalize_action(&mut action, ctx);
    } else {
        // Handle escapes
        let unescaped = atom.replace(r"\{", "{").replace(r"\}", "}");
        action.text = Some(unescaped);
        finalize_action(&mut action, ctx);
    }
    action
}

fn parse_meta(meta: &str, action: &mut Action) {
    if let Some(rest) = meta.strip_prefix('^') {
        action.prev_attach = true;
        // Strip '^' if it is just attach flag?
        // In Plover `^` is attach. `^text` is attach+text.
        if !rest.is_empty() {
             action.text = Some(rest.to_string());
        }
        return;
    }
    if let Some(rest) = meta.strip_suffix('^') {
        action.next_attach = true;
        if !rest.is_empty() {
            action.text = Some(rest.to_string());
        }
        return;
    }
    if meta == "-|" {
        action.next_case = Some(Case::CapFirstWord);
        return;
    }
    if meta == ">" {
        action.next_case = Some(Case::LowerFirstChar);
        return;
    }
    if meta == "<" {
        action.next_case = Some(Case::UpperFirstWord);
        return;
    }
    if meta.starts_with('#') {
        action.combo = Some(meta[1..].to_string());
        return;
    }
    if meta.starts_with("PLOVER:") {
        action.command = Some(meta.to_string());
        return;
    }

    // Default text
    action.text = Some(meta.to_string());
}

fn finalize_action(action: &mut Action, ctx: &FormatterContext) {
    if let Some(text) = &action.text {
        if action.word.is_none() {
             action.word = Some(rightmost_word(text));
        }

        let case_mode = ctx.last_action.next_case;
        let final_text = apply_case(text, case_mode);
        let final_text = apply_mode_case(&final_text, action.case, false);

        action.text = Some(final_text);

        if action.next_attach {
            action.trailing_space.clear();
        } else {
            action.trailing_space = action.space_char.clone();
        }
    }
}
