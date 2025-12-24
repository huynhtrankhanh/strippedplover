pub mod python;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use std::collections::HashSet;

pub trait Dictionary: Send + Sync {
    fn identifier(&self) -> &str;
    fn enabled(&self) -> bool;
    fn set_enabled(&mut self, enabled: bool);
    fn readonly(&self) -> bool;
    fn longest_key(&self) -> usize;

    fn lookup(&self, keys: &[String]) -> Option<String>;
    fn reverse_lookup(&self, translation: &str) -> HashSet<Vec<String>>;
}

pub struct JsonDictionary {
    pub identifier: String,
    pub enabled: bool,
    pub readonly: bool,
    pub conn: Arc<Mutex<Connection>>,
    pub longest_key_cache: usize,
}

impl JsonDictionary {
    pub fn new(identifier: String, conn: Arc<Mutex<Connection>>, enabled: bool, readonly: bool) -> Self {
        let mut dict = JsonDictionary {
            identifier,
            enabled,
            readonly,
            conn,
            longest_key_cache: 0,
        };
        dict.recalculate_longest_key();
        dict
    }

    pub fn recalculate_longest_key(&mut self) {
        let conn = self.conn.lock().unwrap();
        // Check if entries table exists first? It should.
        // Assuming connection is valid.
        let mut stmt = conn.prepare(
            "SELECT MAX(LENGTH(stroke) - LENGTH(REPLACE(stroke, '/', '')) + 1) as maxLen FROM entries WHERE dictionary = ?"
        ).unwrap();

        let max_len: Option<i32> = stmt.query_row([&self.identifier], |row| row.get(0)).unwrap_or(None);
        self.longest_key_cache = max_len.unwrap_or(0) as usize;
    }
}

impl Dictionary for JsonDictionary {
    fn identifier(&self) -> &str {
        &self.identifier
    }

    fn enabled(&self) -> bool {
        self.enabled
    }

    fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    fn readonly(&self) -> bool {
        self.readonly
    }

    fn longest_key(&self) -> usize {
        self.longest_key_cache
    }

    fn lookup(&self, keys: &[String]) -> Option<String> {
        let stroke = keys.join("/");
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT translation FROM entries WHERE stroke = ? AND dictionary = ?").ok()?;
        let translation: String = stmt.query_row([&stroke, &self.identifier], |row| row.get(0)).ok()?;
        Some(translation)
    }

    fn reverse_lookup(&self, translation: &str) -> HashSet<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT stroke FROM entries WHERE translation = ? AND dictionary = ?").unwrap();
        let rows = stmt.query_map([translation, &self.identifier], |row| row.get(0)).unwrap();

        let mut result = HashSet::new();
        for stroke_str in rows.flatten() {
            let stroke_str: String = stroke_str;
            result.insert(stroke_str.split('/').map(|s| s.to_string()).collect());
        }
        result
    }
}
