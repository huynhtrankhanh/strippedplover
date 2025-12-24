use rust_strippedplover::engine::Engine;
use rust_strippedplover::protocol::Request;
use rust_strippedplover::stroke::{self, StrokeConfig};
use std::collections::{HashMap, HashSet};
use serde_json::json;

fn setup() {
    let keys = vec![
        "S".to_string(), "T".to_string(), "K".to_string(), "P".to_string(), "W".to_string(), "H".to_string(),
        "R".to_string(), "A".to_string(), "O".to_string(), "*".to_string(), "E".to_string(), "U".to_string(),
        "-F".to_string(), "-R".to_string(), "-P".to_string(), "-B".to_string(), "-L".to_string(), "-G".to_string(),
        "-T".to_string(), "-S".to_string(), "-D".to_string(), "-Z".to_string()
    ];

    let mut implicit_hyphens = HashSet::new();
    implicit_hyphens.insert("A".to_string());
    implicit_hyphens.insert("O".to_string());
    implicit_hyphens.insert("E".to_string());
    implicit_hyphens.insert("U".to_string());
    implicit_hyphens.insert("*".to_string());
    let numbers = HashMap::new();
    stroke::setup_stroke(keys, implicit_hyphens, Some("#".to_string()), numbers, "*".to_string());
}

#[test]
fn test_python_dictionary_integration() {
    setup();
    let mut engine = Engine::new(":memory:");

    // 1. Import Python Dictionary
    let python_code = r#"
LONGEST_KEY = 1

def lookup(key):
    if key == ('TEFT',):
        return 'test'
    return None
"#;

    let req = Request {
        id: Some(json!(1)),
        method: "import_dictionary".to_string(),
        params: json!({
            "name": "test_py",
            "type": "python",
            "pythonCode": python_code
        }),
    };

    let resp = engine.handle_request(req);
    assert!(resp.error.is_none(), "Import failed: {:?}", resp.error);

    // 2. Translate
    let req = Request {
        id: Some(json!(2)),
        method: "translate".to_string(),
        params: json!({
            "stroke": "TEFT"
        }),
    };

    let resp = engine.handle_request(req);
    assert!(resp.error.is_none(), "Translate failed");

    let result = resp.result.unwrap();
    let output = result.get("output").unwrap().as_array().unwrap();

    assert_eq!(output.len(), 1);
    let elem = output[0].as_object().unwrap();
    assert_eq!(elem.get("type").unwrap().as_str().unwrap(), "preedit");
    assert_eq!(elem.get("text").unwrap().as_str().unwrap(), "test"); // Formatter defaults may apply space
}

#[test]
fn test_python_sandboxing() {
    setup();
    let mut engine = Engine::new(":memory:");

    // Attempt to import os
    let python_code = r#"
LONGEST_KEY = 1
import os

def lookup(key):
    return 'pwned'
"#;

    let req = Request {
        id: Some(json!(1)),
        method: "import_dictionary".to_string(),
        params: json!({
            "name": "malicious",
            "type": "python",
            "pythonCode": python_code
        }),
    };

    let resp = engine.handle_request(req);
    assert!(resp.error.is_none());

    // Now try lookup
    let req = Request {
        id: Some(json!(2)),
        method: "translate".to_string(),
        params: json!({
            "stroke": "TEFT"
        }),
    };
    let resp = engine.handle_request(req);
    let result = resp.result.unwrap();
    let output = result.get("output").unwrap().as_array().unwrap();

    println!("Sandbox Result: {:?}", output);
}
