# Runtime diagnostics tools

The debug entrypoint exposes three layers with separate responsibilities.

## Debug primitives

`subtle.history()`, `subtle.snapshot()`, `subtle.graph()`,
`subtle.graphIntegrity()`, and `subtle.stackStats()` expose runtime facts.

## Reflex diagnostics

```ts
import { subtle } from "@volynets/reflex-runtime/debug";

const diagnostics = subtle.diagnostics();

diagnostics.graph.dump();
diagnostics.graph.node(12);
diagnostics.dependencies.whyDirty(12);
diagnostics.dependencies.chain(12);
diagnostics.runtime.scheduler();
diagnostics.timeline.timestamps(12);
diagnostics.statistics.summary();
```

This layer understands Reflex graph state and event history, but has no LLM or
transport dependency. Every operation is read-only and returns a structured
`RuntimeDiagnosticResult`.

Some facts cannot currently be measured. `trackingStack`, `validatedAt`, cache
hits, and cache misses explicitly report that they are unavailable instead of
inferring values.

## MCP adapter

```ts
const mcp = subtle.mcp();

mcp.list();
mcp.call("graph.dump");
mcp.call("dependency.whyDirty", { id: 12 });
```

The adapter only publishes JSON Schema tool definitions and routes calls into
the diagnostics layer. It is useful when the host already owns the transport.

## MCP stdio server

The protocol boundary is provided by the separate
`@volynets/reflex-runtime-mcp` package. The runtime package itself does not
install the MCP SDK or Zod:

```ts
import { subtle } from "@volynets/reflex-runtime/debug";
import { serveRuntimeMcpStdio } from "@volynets/reflex-runtime-mcp";

serveRuntimeMcpStdio(subtle.mcp());
```

For the standard development build, the same server is available as a CLI:

```bash
npx reflex-runtime-mcp
```

The official `@modelcontextprotocol/server` package owns initialization,
capability negotiation, validation dispatch, JSON-RPC, stdio framing, and
transport lifecycle. Reflex only owns the diagnostic tool catalog and its
result contracts.

Example `tools/call` request:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "dependency.whyDirty",
    "arguments": { "id": 12 }
  }
}
```

The response contains both MCP text content and structured diagnostic data:

```json
{
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "{...}" }],
    "isError": false,
    "structuredContent": { "ok": true, "result": {} }
  }
}
```

### Embedding in a host

The standalone CLI observes the debug runtime created in that process. It
cannot inspect a different application process. An application that owns the
runtime should embed the transport in its own process:

```ts
import { subtle } from "@volynets/reflex-runtime/debug";
import { serveRuntimeMcpStdio } from "@volynets/reflex-runtime-mcp";

// Create signals/computeds/watchers before starting the server when needed.
serveRuntimeMcpStdio(subtle.mcp());
```

For an HTTP server, WebSocket bridge, authentication, or a full MCP SDK
integration, reuse `subtle.mcp()` and implement the host-specific transport
around `list()` and `call()`.

## Development and smoke testing

Open the official MCP Inspector against the built publish artifact:

```bash
pnpm --filter @volynets/reflex-runtime-mcp build
npx @modelcontextprotocol/inspector node packages/reflex-runtime-mcp/dist/entrypoint.js
```

Run the automated SDK client/server smoke test:

```bash
pnpm --filter @volynets/reflex-runtime-mcp smoke
```

The smoke test uses the official MCP client and an in-memory transport. It
checks tool discovery, generated input schemas, a real tool call, unknown-tool
handling, and SDK-level argument validation.

Tool families:

- `graph.*`
- `runtime.*`
- `dependency.*`
- `timeline.*`
- `statistics.*`
