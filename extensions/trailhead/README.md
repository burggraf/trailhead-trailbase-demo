# Trailhead Rust WASM component

One TrailBase component containing user-aware HTTP handlers and scheduled jobs. See [`../../docs/workshop.md`](../../docs/workshop.md#8-wasm-extension) for the route tour.

```bash
cargo fmt --manifest-path extensions/trailhead/Cargo.toml -- --check
cargo clippy --manifest-path extensions/trailhead/Cargo.toml --target wasm32-wasip2 --no-deps -- -D warnings
cargo build --manifest-path extensions/trailhead/Cargo.toml --release --target wasm32-wasip2
cp extensions/trailhead/target/wasm32-wasip2/release/trailhead.wasm traildepot/wasm/
```

Restart TrailBase, then run `scripts/authorization-smoke.sh` from the repository root.

The SDK is pinned because TrailBase documents the Rust guest API as unstable. Native tests cannot currently link the SDK’s exported WASI symbols; use wasm clippy/build plus HTTP smoke tests. Pure helper tests remain in the source for when native linking becomes available.
