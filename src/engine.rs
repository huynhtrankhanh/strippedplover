use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use crate::dictionary::{Dictionary, JsonDictionary};
use crate::dictionary::python::PythonDictionary;
use crate::translation::dictionary_collection::StenoDictionaryCollection;
use crate::translation::Translator;
use crate::formatting::Formatter;
use crate::protocol::{Request, Response, ErrorResponse, UNKNOWN_METHOD, GENERAL_ERROR};
use crate::stroke::{Stroke, normalize_steno};
use serde_json::Value;

pub struct Engine {
    translator: Translator,
    formatter: Formatter,
    conn: Arc<Mutex<Connection>>,

    // State
    attach: bool,
    capitalize: bool,
    space_char: String,
}

impl Engine {
    pub fn new(db_path: &str) -> Self {
        let conn = Connection::open(db_path).expect("Failed to open DB");
        let conn = Arc::new(Mutex::new(conn));

        {
            let conn_lock = conn.lock().unwrap();
            conn_lock.execute("PRAGMA foreign_keys = ON;", []).unwrap();
             conn_lock.execute(
                "CREATE TABLE IF NOT EXISTS dictionaries (
                    name TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    enabled BOOLEAN DEFAULT 1,
                    readonly BOOLEAN DEFAULT 0,
                    priority INTEGER,
                    python_code TEXT
                )",
                [],
            ).unwrap();

            conn_lock.execute(
                "CREATE TABLE IF NOT EXISTS entries (
                    dictionary TEXT,
                    stroke TEXT,
                    translation TEXT,
                    PRIMARY KEY (dictionary, stroke),
                    FOREIGN KEY (dictionary) REFERENCES dictionaries(name) ON DELETE CASCADE
                )",
                [],
            ).unwrap();
        }

        let mut engine = Engine {
            translator: Translator::new(),
            formatter: Formatter::new(),
            conn,
            attach: true,
            capitalize: false,
            space_char: " ".to_string(),
        };

        engine.sync_formatter_state();
        engine.load_dictionaries();
        engine
    }

    fn sync_formatter_state(&mut self) {
        self.formatter.start_attached = self.attach;
        self.formatter.start_capitalized = self.capitalize;
        self.formatter.space_char = self.space_char.clone();
    }

    fn load_dictionaries(&mut self) {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT name, type, enabled, readonly, python_code FROM dictionaries ORDER BY priority DESC").unwrap();
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, bool>(2)?,
                row.get::<_, bool>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        }).unwrap();

        let mut dicts: Vec<Box<dyn Dictionary>> = Vec::new();
        let mut dict_data = Vec::new();
        for row in rows {
            dict_data.push(row.unwrap());
        }
        drop(stmt);
        drop(conn);

        for (name, type_, enabled, readonly, python_code) in dict_data {
            if type_ == "json" {
                let dict = JsonDictionary::new(name, self.conn.clone(), enabled, readonly);
                dicts.push(Box::new(dict));
            } else if type_ == "python" {
                if let Some(code) = python_code {
                     let dict = PythonDictionary::new(name, code, enabled);
                     dicts.push(Box::new(dict));
                }
            }
        }

        let mut collection = StenoDictionaryCollection::new();
        collection.set_dicts(dicts);
        self.translator.set_dictionary(collection);
    }

    pub fn handle_request(&mut self, req: Request) -> Response<Value> {
        match req.method.as_str() {
            "translate" => {
                if let Some(stroke_str) = req.params.get("stroke").and_then(|v| v.as_str()) {
                    let stroke = Stroke::from_steno(stroke_str);

                    self.translator.translate(stroke);
                    let (undo, do_trans) = self.translator.flush();

                    let prev_len = self.translator.state.translations.len().saturating_sub(do_trans.len());
                    let prev = self.translator.state.translations[..prev_len].to_vec();

                    let output_elements = self.formatter.format(undo, do_trans, Some(prev));

                    let output_json = serde_json::to_value(output_elements).unwrap();

                    Response {
                        id: req.id,
                        result: Some(serde_json::json!({ "output": output_json })),
                        error: None,
                    }
                } else {
                    Response {
                        id: req.id,
                        result: None,
                        error: Some(ErrorResponse { code: GENERAL_ERROR, message: "Missing stroke".into() }),
                    }
                }
            },
            "reset_state" => {
                self.translator.clear_state();
                self.formatter.reset();
                self.sync_formatter_state();
                Response {
                    id: req.id,
                    result: Some(serde_json::json!({ "status": "ok" })),
                    error: None,
                }
            },
            "import_dictionary" => {
                let name = req.params.get("name").and_then(|v| v.as_str());
                let type_ = req.params.get("type").and_then(|v| v.as_str());

                if let (Some(name), Some(dict_type)) = (name, type_) {
                    let conn = self.conn.lock().unwrap();

                    if dict_type == "python" {
                        let python_code = req.params.get("pythonCode").and_then(|v| v.as_str());
                         if let Some(code) = python_code {
                            conn.execute(
                                "INSERT OR REPLACE INTO dictionaries (name, type, enabled, readonly, priority, python_code) VALUES (?, ?, 1, 1, 0, ?)",
                                [name, dict_type, code],
                            ).unwrap();
                         } else {
                             return Response { id: req.id, result: None, error: Some(ErrorResponse { code: GENERAL_ERROR, message: "Missing pythonCode".into() })};
                         }
                    } else if dict_type == "json" {
                         conn.execute(
                            "INSERT OR REPLACE INTO dictionaries (name, type, enabled, readonly, priority) VALUES (?, ?, 1, 0, 0)",
                            [name, dict_type],
                        ).unwrap();

                        if let Some(data) = req.params.get("data").and_then(|v| v.as_object()) {
                             conn.execute("DELETE FROM entries WHERE dictionary = ?", [name]).unwrap();

                             let mut stmt = conn.prepare("INSERT INTO entries (dictionary, stroke, translation) VALUES (?, ?, ?)").unwrap();
                             for (k, v) in data {
                                 if let Some(trans) = v.as_str() {
                                     let stroke_tuple = normalize_steno(k);
                                     let stroke_str = stroke_tuple.join("/");
                                     stmt.execute([name, &stroke_str, trans]).unwrap();
                                 }
                             }
                        }
                    } else {
                         return Response { id: req.id, result: None, error: Some(ErrorResponse { code: GENERAL_ERROR, message: "Invalid type".into() })};
                    }
                    drop(conn);
                    self.load_dictionaries();

                    Response {
                        id: req.id,
                        result: Some(serde_json::json!({ "status": "ok", "name": name, "type": dict_type })),
                        error: None,
                    }
                } else {
                    Response {
                        id: req.id,
                        result: None,
                        error: Some(ErrorResponse { code: GENERAL_ERROR, message: "Missing name or type".into() }),
                    }
                }
            },
             "quit" => {
                Response {
                    id: req.id,
                    result: Some(serde_json::json!({ "status": "ok" })),
                    error: None,
                }
            },
            _ => {
                Response {
                    id: req.id,
                    result: None,
                    error: Some(ErrorResponse { code: UNKNOWN_METHOD, message: format!("Unknown method: {}", req.method) }),
                }
            }
        }
    }
}
