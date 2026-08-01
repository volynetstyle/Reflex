# Reflex runtime architecture rules

Keep the runtime core independent from diagnostics and MCP.

- Do not add metadata allocation, event history, WeakRef registries, Zod
  schemas, or MCP imports to a hot path.
- The only permitted core-to-debug dependency is the no-op hook bridge in
  `debug/debug.runtime.ts`.
- Keep diagnostics read-only and keep protocol concerns in `mcp/` and the
  official MCP SDK.
- Debug registries must not strongly retain reactive nodes.
- Add or update an architecture-contract check when changing these boundaries.

See `docs/architecture-contract.md` for the complete contract.
