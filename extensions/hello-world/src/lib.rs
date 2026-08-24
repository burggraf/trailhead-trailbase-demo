#![forbid(unsafe_code, clippy::unwrap_used)]

use trailbase_wasm::http::{HttpRoute, Json, routing};
use trailbase_wasm::{Guest, export};

struct HelloWorld;

impl Guest for HelloWorld {
  fn http_handlers() -> Vec<HttpRoute> {
    vec![routing::get("/hello", async |_| {
      Json(serde_json::json!({"message": "Hello, world!"}))
    })]
  }
}

export!(HelloWorld);
