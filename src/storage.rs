use rusqlite::{Connection, Result};
use std::path::Path;

pub struct Storage {
    conn: Connection,
}

impl Storage {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute("PRAGMA foreign_keys = ON;", [])?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS dictionaries (
                name TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                enabled BOOLEAN DEFAULT 1,
                readonly BOOLEAN DEFAULT 0,
                priority INTEGER,
                python_code TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS entries (
                dictionary TEXT,
                stroke TEXT,
                translation TEXT,
                PRIMARY KEY (dictionary, stroke),
                FOREIGN KEY (dictionary) REFERENCES dictionaries(name) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_translation ON entries(translation)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dictionary ON entries(dictionary)", [])?;

        Ok(Storage { conn })
    }

    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }

    pub fn get_connection_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }
}
