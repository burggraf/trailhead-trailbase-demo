# Hello World TrailBase Extension Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add a maintainable Rust/Wasmtime TrailBase component that returns JSON from `GET /hello`.

**Architecture:** An independent `cdylib` crate implements TrailBase's `Guest` interface and exports one HTTP route. Build output is installed in `traildepot/wasm` and verified against the local server.

**Tech Stack:** Rust 2024, `trailbase-wasm` 0.6.0, WebAssembly component model, Wasmtime in TrailBase.

---

### Task 1: Test the response

**Files:** Create `extensions/hello-world/Cargo.toml` and `extensions/hello-world/src/lib.rs`.

1. Add an HTTP smoke test expecting the exact JSON response.
2. Run it before installation and verify it fails with HTTP 404.

### Task 2: Implement the component

**Files:** Modify `extensions/hello-world/src/lib.rs`.

1. Add `hello_json`, a GET `/hello` route returning `Json(hello_json())`, `Guest`, and `export!`.
2. Run clippy for the WASI target.
3. Build with `cargo build --release --target wasm32-wasip2`.

### Task 3: Install and document

**Files:** Create `extensions/hello-world/README.md`; install `traildepot/wasm/hello_world.wasm`.

1. Install the release artifact with `trail components add` or copy it if required.
2. Restart TrailBase if component discovery is startup-only.
3. Verify `GET /hello` returns the expected JSON.
4. Record build, install, restart, and smoke-test commands in the README.
