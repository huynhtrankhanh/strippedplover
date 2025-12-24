use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "lowercase")]
pub enum OutputElement {
    Committed { text: String },
    Keypress { combo: String },
    Preedit { text: String },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Request {
    pub id: Option<serde_json::Value>,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Response<T> {
    pub id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub code: i32,
    pub message: String,
}

pub const PARSE_ERROR: i32 = -32700;
pub const UNKNOWN_METHOD: i32 = -32601;
pub const GENERAL_ERROR: i32 = -32000;
