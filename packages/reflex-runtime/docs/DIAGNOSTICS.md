# Runtime diagnostics

Diagnostics live behind `@volynets/reflex-runtime/debug` and never change
production behavior; the boundary is enforced by
[architecture-contract.md](./architecture-contract.md). Import the debug entry
point before the regular runtime entry point when a process needs live debug
events: it installs the development flag and the debug implementation.

Four layers, each built on the one before:

| Layer           | Surface                                                      | Responsibility                                             |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Instrumentation | typed `RuntimeDebugEvent` values                             | records runtime facts                                      |
| Primitives      | `subtle.history/snapshot/graph/graphIntegrity/stackStats`    | local inspection for tests, tools and adapters             |
| Protocol        | `subtle.session()`                                           | versioned messages that can cross a transport boundary     |
| Diagnostics     | `subtle.diagnostics()`, `subtle.mcp()`, `reflex-runtime-mcp` | Reflex-aware, read-only queries and their MCP tool catalog |

## Primitives and graph inspection

`subtle.graph(node, options)` returns a bounded graph snapshot:

- `direction: "sources"` walks upstream dependencies, `"sinks"` downstream
  subscribers, `"both"` both directions;
- `depth` limits traversal depth from the root.

Edges include `incomingIndex`, `outgoingIndex`, and `version`, so tools can
detect ordering changes without reaching into runtime internals.

`subtle.graphIntegrity(node)` checks structural invariants (previous links,
`lastIn`/`lastOut`/`tailIn`, back-references, dangling and duplicate edges)
and returns `{ ok, issues }`; each issue has a stable `code`.

## Protocol

Current version: `RUNTIME_DEBUG_PROTOCOL_VERSION = 1`. Every message includes
`protocolVersion`; consumers should reject or degrade gracefully on a newer
unsupported version.

```ts
import { subtle } from "@volynets/reflex-runtime/debug";

const session = subtle.session();
const dispose = session.observe((message) => {
  // debug:handshake, debug:event, debug:snapshot, debug:response
});

session.snapshot({ graph: subtle.graph(node) });
dispose();
session.destroy();
```

The first observed message is always `debug:handshake`. Runtime events are
then forwarded as `debug:event`. A client can request or publish a full
`debug:snapshot` when it needs to resync.

## Diagnostics

```ts
const diagnostics = subtle.diagnostics();

diagnostics.graph.dump();
diagnostics.graph.node(12);
diagnostics.dependencies.whyDirty(12);
diagnostics.dependencies.chain(12);
diagnostics.runtime.scheduler();
diagnostics.timeline.timestamps(12);
diagnostics.statistics.summary();
```

This layer understands Reflex graph state and event history but has no LLM or
transport dependency. Every operation is read-only and returns a structured
`RuntimeDiagnosticResult`. Facts that cannot be measured (`trackingStack`,
`validatedAt`, cache hits and misses) are reported as unavailable, not inferred.

## MCP

`subtle.mcp()` publishes the diagnostics as JSON Schema tool definitions and
routes calls; use it when the host already owns a transport:

```ts
const mcp = subtle.mcp();
mcp.list();
mcp.call("dependency.whyDirty", { id: 12 });
```

Tool families: `graph.*`, `runtime.*`, `dependency.*`, `timeline.*`,
`statistics.*`.

The protocol boundary is the separate `@volynets/reflex-runtime-mcp` package;
the runtime itself does not install the MCP SDK or Zod. The official
`@modelcontextprotocol/server` owns initialization, capability negotiation,
validation, JSON-RPC, stdio framing and transport lifecycle; Reflex owns only
the tool catalog and result contracts.

```ts
import { subtle } from "@volynets/reflex-runtime/debug";
import { serveRuntimeMcpStdio } from "@volynets/reflex-runtime-mcp";

// Create signals/computeds/watchers first when needed.
serveRuntimeMcpStdio(subtle.mcp());
```

The CLI (`npx reflex-runtime-mcp`) observes only the debug runtime of its own
process; an application that owns the runtime embeds the transport as above.
For HTTP, WebSocket, authentication or a custom SDK integration, implement the
transport around `list()` and `call()`.

A `tools/call` for `dependency.whyDirty` with `{ "id": 12 }` returns MCP text
content plus `structuredContent: { ok, result }`.

Smoke testing:

```bash
pnpm --filter @volynets/reflex-runtime-mcp build
npx @modelcontextprotocol/inspector node packages/reflex-runtime-mcp/dist/entrypoint.js
pnpm --filter @volynets/reflex-runtime-mcp smoke
```

The smoke test uses the official MCP client over an in-memory transport and
checks tool discovery, generated input schemas, a real call, unknown-tool
handling and SDK-level argument validation.
