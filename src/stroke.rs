use std::collections::{HashMap, HashSet};
use lazy_static::lazy_static;
use std::sync::Mutex;

lazy_static! {
    static ref STROKE_CONFIG: Mutex<Option<StrokeConfig>> = Mutex::new(None);
}

#[derive(Clone, Debug)]
pub struct StrokeConfig {
    pub keys: Vec<String>,
    pub implicit_hyphen_keys: HashSet<String>,
    pub number_key: Option<String>,
    pub numbers: HashMap<String, String>,
    pub undo_stroke_steno: String,
    // Derived
    pub key_order: HashMap<String, usize>,
}

pub fn setup_stroke(
    keys: Vec<String>,
    implicit_hyphen_keys: HashSet<String>,
    number_key: Option<String>,
    numbers: HashMap<String, String>,
    undo_stroke_steno: String,
) {
    let mut key_order = HashMap::new();
    for (i, key) in keys.iter().enumerate() {
        key_order.insert(key.clone(), i);
        if let Some(num) = numbers.get(key) {
            key_order.insert(num.clone(), i);
        }
    }

    let config = StrokeConfig {
        keys,
        implicit_hyphen_keys,
        number_key,
        numbers,
        undo_stroke_steno,
        key_order,
    };

    *STROKE_CONFIG.lock().unwrap() = Some(config);
}

pub fn get_stroke_config() -> StrokeConfig {
    STROKE_CONFIG
        .lock()
        .unwrap()
        .clone()
        .expect("Stroke system not initialized")
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
pub struct Stroke {
    value: u32,
}

impl Stroke {
    pub const fn new(value: u32) -> Self {
        Stroke { value }
    }

    pub fn from_steno(steno: &str) -> Self {
        let value = stroke_from_steno(steno);
        Stroke { value }
    }

    pub fn to_rtfcre(&self) -> String {
        stroke_to_steno(self.value)
    }

    pub fn is_correction(&self) -> bool {
        let cfg = get_stroke_config();
        self.value == Stroke::from_steno(&cfg.undo_stroke_steno).value
    }

    pub fn contains(&self, other: &Stroke) -> bool {
        (self.value & other.value) == other.value
    }

    pub fn subtract(&self, other: &Stroke) -> Stroke {
        Stroke { value: self.value & !other.value }
    }
}

fn stroke_from_steno(steno: &str) -> u32 {
    let cfg = get_stroke_config();
    if steno.is_empty() {
        return 0;
    }

    let mut keys = Vec::new();
    let mut remaining = steno;
    let mut has_number = false;

    if let Some(ref nk) = cfg.number_key {
        if remaining.starts_with('#') {
            has_number = true;
            remaining = &remaining[1..];
        }
    }

    let hyphen_index = remaining.find('-');
    let has_explicit_hyphen = hyphen_index.is_some();

    // Find implicit hyphen
    let mut implicit_hyphen_pos = None;
    if !has_explicit_hyphen {
        for (i, _) in remaining.char_indices() {
             let suffix = &remaining[i..];
             for impl_key in &cfg.implicit_hyphen_keys {
                 let key_char = impl_key.replace('-', "");
                 if suffix.starts_with(&key_char) {
                     implicit_hyphen_pos = Some(i);
                     break;
                 }
             }
             if implicit_hyphen_pos.is_some() { break; }
        }
    }

    let boundary_pos = if let Some(idx) = hyphen_index {
        idx
    } else {
        implicit_hyphen_pos.unwrap_or(remaining.len()) // Default to end if not found
    };

    // Left part
    let left_part = &remaining[0..boundary_pos];
    let mut left_remaining = left_part;

    while !left_remaining.is_empty() {
        let mut matched = false;
        for key in &cfg.keys {
            if key.starts_with('-') { continue; }
            let key_char = key.replace('-', "");

            if left_remaining.starts_with(&key_char) {
                 // Check number substitution
                 if has_number {
                     if let Some(num_val) = cfg.numbers.get(key) {
                         let num_char = num_val.replace('-', "");
                         if left_remaining.starts_with(&num_char) {
                             // This block logic from TS seems slightly different
                             // In TS: if hasNumber && numbers.has(key) && leftRemaining.startsWith(numChar) -> push(key)
                             // But wait, we are iterating keys, so we check if text matches key OR number char
                             // The TS logic iterates keys, then checks if text matches keyChar OR numChar
                         }
                     }
                 }

                 keys.push(key.clone());
                 left_remaining = &left_remaining[key_char.len()..];
                 matched = true;
                 break;
            }

            // Check number char directly
            if has_number {
                if let Some(num_val) = cfg.numbers.get(key) {
                    let num_char = num_val.replace('-', "");
                     if left_remaining.starts_with(&num_char) {
                        keys.push(key.clone());
                        left_remaining = &left_remaining[num_char.len()..];
                        matched = true;
                        break;
                     }
                }
            }
        }
        if !matched {
            // consume one char? In TS: leftRemaining.slice(1)
            let mut chars = left_remaining.chars();
            chars.next();
            left_remaining = chars.as_str();
        }
    }

    // Right part
    let right_part = if has_explicit_hyphen {
        &remaining[hyphen_index.unwrap() + 1..]
    } else if let Some(pos) = implicit_hyphen_pos {
        &remaining[pos..]
    } else {
        ""
    };

    let mut right_remaining = right_part;
    while !right_remaining.is_empty() {
        let mut matched = false;
        for key in &cfg.keys {
            let key_char = key.replace('-', "");
            if key.starts_with('-') || cfg.implicit_hyphen_keys.contains(key) {
                if right_remaining.starts_with(&key_char) {
                    if !keys.contains(key) {
                        keys.push(key.clone());
                    }
                    right_remaining = &right_remaining[key_char.len()..];
                    matched = true;
                    break;
                }
                 // Check number char directly
                if has_number {
                    if let Some(num_val) = cfg.numbers.get(key) {
                        let num_char = num_val.replace('-', "");
                         if right_remaining.starts_with(&num_char) {
                            if !keys.contains(key) {
                                keys.push(key.clone());
                            }
                            right_remaining = &right_remaining[num_char.len()..];
                            matched = true;
                            break;
                         }
                    }
                }
            }
        }
        if !matched {
             let mut chars = right_remaining.chars();
            chars.next();
            right_remaining = chars.as_str();
        }
    }

    if has_number {
        if let Some(nk) = &cfg.number_key {
            if !keys.contains(nk) {
                keys.push(nk.clone());
            }
        }
    }

    // Auto detect number key from content? TS does this.
    // Simplifying for now.

    stroke_from_keys(&keys)
}


fn stroke_from_keys(keys: &[String]) -> u32 {
    let cfg = get_stroke_config();
    let mut value = 0;
    for key in keys {
        if let Some(&idx) = cfg.key_order.get(key) {
            value |= 1 << idx;
        }
    }
    value
}

fn stroke_to_steno(value: u32) -> String {
    let cfg = get_stroke_config();
    let mut keys = Vec::new();
    for (i, key) in cfg.keys.iter().enumerate() {
        if (value & (1 << i)) != 0 {
            keys.push(key.clone());
        }
    }

    // Sort logic is implicit in iteration order of cfg.keys if they are in order

    if keys.is_empty() {
        return String::new();
    }

    let has_number_key = if let Some(nk) = &cfg.number_key {
        keys.contains(nk)
    } else {
        false
    };

    let mut result = String::new();
    let mut need_hyphen = true;
    let mut past_implicit = false;

    for key in &keys {
        if Some(key) == cfg.number_key.as_ref() {
            continue;
        }

        let key_char = key.replace('-', "");

        if cfg.implicit_hyphen_keys.contains(key) {
            past_implicit = true;
            need_hyphen = false;
        }

        if key.starts_with('-') && need_hyphen && !past_implicit {
            result.push('-');
            need_hyphen = false;
        }

        if has_number_key {
            if let Some(num) = cfg.numbers.get(key) {
                result.push_str(&num.replace('-', ""));
            } else {
                result.push_str(&key_char);
            }
        } else {
             result.push_str(&key_char);
        }
    }

    if has_number_key {
        // Simple check if result has numbers
        let has_num_char = cfg.numbers.values().any(|v| result.contains(&v.replace('-', "")));
        if !has_num_char {
             result.insert(0, '#');
        }
    }

    result
}

pub fn normalize_steno(steno: &str) -> Vec<String> {
    steno.split('/')
        .map(|s| Stroke::from_steno(s).to_rtfcre())
        .collect()
}
