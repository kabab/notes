# Notes

Personal notes + tasks app. Tauri 2 (Rust) + React Router 7 + CodeMirror 6 + SQLite.
See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together and what later phases need.

## Layout

- `crates/vault-core/` — all business logic and storage (no Tauri). Reusable on Android / a future server.
- `src-tauri/` — thin Tauri command layer over `vault-core`.
- `src/api.ts` — the only frontend module that talks to the backend.
- `src/bindings/` — TypeScript types generated from Rust structs (`pnpm bindings`, commit the output).

## Commands

```sh
nvm use                 # Node 24 LTS
pnpm install
pnpm tauri dev          # run the app
cargo test              # Rust tests
pnpm test               # frontend tests (Vitest)
pnpm typecheck
pnpm bindings           # regenerate src/bindings after changing Rust model types
pnpm tauri build        # release .app / .dmg
```

Data lives in `~/Library/Application Support/com.gatopi.notes/` (`vault.db`, later `attachments/`).
