# Hello World TrailBase Extension Design

Build one independent Rust WebAssembly component at `extensions/hello-world`. It registers `GET /hello` and returns `{"message":"Hello, world!"}` through TrailBase's `Json` response wrapper.

The crate uses the current published `trailbase-wasm = "=0.6.0"`, Rust 2024, `cdylib`, safe-code/clippy lints, and a size-oriented release profile. A small curl smoke test checks the installed component end to end; native unit tests cannot link the SDK's exported WASI symbols.

The release artifact is copied to `traildepot/wasm/hello_world.wasm`. TrailBase documents WASM discovery at startup, so deployment requires a restart unless the running server detects a component installed through its management API.

Skipped for now: a Cargo workspace, CI, shared SDK wrapper, database access, authentication, and a generalized deployment tool. Add these only when a second extension or production release process creates the need.
