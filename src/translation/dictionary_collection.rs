use crate::dictionary::Dictionary;

pub struct StenoDictionaryCollection {
    pub dicts: Vec<Box<dyn Dictionary>>,
}

impl Default for StenoDictionaryCollection {
    fn default() -> Self {
        Self::new()
    }
}

impl StenoDictionaryCollection {
    pub fn new() -> Self {
        StenoDictionaryCollection {
            dicts: Vec::new(),
        }
    }

    pub fn set_dicts(&mut self, dicts: Vec<Box<dyn Dictionary>>) {
        self.dicts = dicts;
    }

    pub fn longest_key(&self) -> usize {
        self.dicts.iter()
            .filter(|d| d.enabled())
            .map(|d| d.longest_key())
            .max()
            .unwrap_or(0)
    }

    pub fn lookup(&self, keys: &[String]) -> Option<String> {
        let key_len = keys.len();
        if key_len > self.longest_key() {
            return None;
        }

        for dict in &self.dicts {
            if !dict.enabled() {
                continue;
            }
            if key_len > dict.longest_key() {
                continue;
            }

            if let Some(val) = dict.lookup(keys) {
                return Some(val);
            }
        }
        None
    }
}
