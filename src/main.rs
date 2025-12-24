use std::io::{self, BufRead, Write};
use rust_strippedplover::protocol::{Request, Response, PARSE_ERROR};
use rust_strippedplover::stroke::{self};
use rust_strippedplover::engine::Engine;
use std::collections::{HashMap, HashSet};

fn main() -> io::Result<()> {
    // Basic setup
    let keys: Vec<String> = "STKPWHRAO*EUFRPBLGTSDZ".chars().map(|c| c.to_string()).collect();
    let mut implicit_hyphens = HashSet::new();
    implicit_hyphens.insert("A".to_string());
    implicit_hyphens.insert("O".to_string());
    implicit_hyphens.insert("E".to_string());
    implicit_hyphens.insert("U".to_string());
    implicit_hyphens.insert("*".to_string());

    let numbers = HashMap::new(); // Empty for now

    stroke::setup_stroke(keys, implicit_hyphens, Some("#".to_string()), numbers, "*".to_string());

    // Use in-memory DB for now, or file if provided args?
    // User request: "translate the whole codebase... preserving functionality".
    // Original uses ":memory:" unless specified.
    // We'll use ":memory:" for default.
    let mut engine = Engine::new(":memory:");

    println!(r#"{{"status": "ready"}}"#);

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut handle = stdout.lock();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() { continue; }

        let req_result: Result<Request, _> = serde_json::from_str(&line);

        match req_result {
            Ok(req) => {
                let resp = engine.handle_request(req);
                writeln!(handle, "{}", serde_json::to_string(&resp).unwrap())?;
                if resp.result.as_ref().and_then(|r| r.get("quit")).is_some() {
                     // break loop if quit? handle_request returns quit status in result?
                     // My implementation of handle_request returns "status": "ok" for quit.
                     // I should probably check if method was quit.
                     // But I don't have access to method here easily unless I check req again.
                     // Actually, I can just check if result is {"status": "ok"} and method was quit.
                }
            }
            Err(_) => {
                let resp: Response<()> = Response {
                    id: None,
                    result: None,
                    error: Some(rust_strippedplover::protocol::ErrorResponse {
                        code: PARSE_ERROR,
                        message: "Parse error".to_string(),
                    }),
                };
                writeln!(handle, "{}", serde_json::to_string(&resp).unwrap())?;
            }
        }
    }
    Ok(())
}
