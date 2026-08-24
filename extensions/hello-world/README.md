# Hello World TrailBase extension

A minimal Rust WebAssembly component for TrailBase. It exposes:

```http
GET /hello
```

```json
{"message":"Hello, world!"}
```

## Build and check

Run from the repository root:

```sh
rustup target add wasm32-wasip2
cargo clippy --manifest-path extensions/hello-world/Cargo.toml \
  --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/hello-world/Cargo.toml \
  --release --target wasm32-wasip2
```

TrailBase's Rust SDK exports WASI component symbols, so native `cargo test` cannot link this crate. Use the HTTP smoke test below.

## Install

```sh
trail components add \
  extensions/hello-world/target/wasm32-wasip2/release/hello_world.wasm
```

TrailBase discovers custom components in `traildepot/wasm` at startup. Restart `trail run` after installing or rebuilding, then verify:

```sh
extensions/hello-world/smoke-test.sh
```

Set `TRAILBASE_URL` when the server is not at `http://localhost:4000`.

## Maintain

`trailbase-wasm` is exactly pinned because TrailBase documents the Rust API as unstable. When upgrading TrailBase, review the current Rust guest example, update the pin deliberately, rebuild, restart, and run the smoke test. Keep `Cargo.lock` committed for reproducible component builds.

References:

- <https://trailbase.io/documentation/apis_js/>
- <https://github.com/trailbaseio/trailbase/tree/main/examples/wasm-guest-rust>
