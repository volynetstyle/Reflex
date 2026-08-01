# Runtime architecture contract

Reflex is a reactive runtime first. Debugging and MCP are access layers around
the runtime, not runtime features optimized for an LLM.

```text
runtime core
    ↓
debug primitives
    ↓
diagnostics model
    ↓
@volynets/reflex-runtime-mcp / official MCP SDK
```

## Required invariants

- Production runtime behavior must not depend on MCP, diagnostics, or the MCP
  SDK.
- Debug instrumentation must be disabled in production builds and must not add
  significant hot-path work when disabled.
- Debug registries must not strongly retain reactive nodes. Node identity uses
  weak references or an equivalent non-owning mechanism.
- Debugging must not change runtime semantics, scheduling, propagation, or GC
  ownership.
- Profiling is optional. The runtime must remain usable without a profiler
  consumer or profiler-specific host integration.
- JSON serialization, graph limits, evidence markers, and unavailable-data
  semantics belong to diagnostics. JSON-RPC, framing, handshake, capability
  negotiation, and transport lifecycle belong to the official MCP SDK.

## Allowed dependency direction

The core may use the tiny `debug.runtime` hook bridge. That bridge is a no-op
until the debug entrypoint installs its implementation and is tree-shaken from
production artifacts.

The core must not make runtime imports of:

- `diagnostics`;
- `tool-catalog`;
- `mcp/server`;
- `mcp/stdio`;
- `@modelcontextprotocol/*`;
- Zod schemas used only for tool publication.

Type-only re-exports of diagnostic/debug contracts from the public `subtle`
surface are allowed; they do not load the diagnostics implementation into the
production artifact.

## Enforcement

Run the architecture check after a build:

```bash
pnpm --filter @volynets/reflex-runtime check:architecture
```

The check inspects the generated production artifacts and the core source
boundary. It is also part of `prepublishOnly`.

Any exception must document its cost, production bundle impact, GC ownership
impact, and why the dependency cannot remain in the debug or diagnostics layer.
