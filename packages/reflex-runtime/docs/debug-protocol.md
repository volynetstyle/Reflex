# Runtime Debug Protocol

The runtime debug layer is split into three boundaries:

1. Runtime instrumentation records typed `RuntimeDebugEvent` values.
2. `subtle` exposes local inspection tools for tests, diagnostics, and adapters.
3. The debug protocol wraps events and snapshots into versioned messages that can
   cross a transport boundary.

Import `@volynets/reflex-runtime/debug` before the regular runtime entrypoint
when a process needs live debug events. The debug entrypoint installs the dev
flag and debug implementation.

## Protocol Version

Current version: `RUNTIME_DEBUG_PROTOCOL_VERSION = 1`.

Every protocol message includes `protocolVersion`. Consumers should reject or
degrade gracefully when receiving a newer unsupported version.

## Message Flow

Debug clients open a local session through `subtle.session()`.

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

The first observed message is always `debug:handshake`. Runtime events are then
forwarded as `debug:event`. A client can request or publish a full
`debug:snapshot` when it needs to resync.

## Graph Inspection

`subtle.graph(node, options)` returns a bounded graph snapshot:

- `direction: "sources"` walks upstream dependencies.
- `direction: "sinks"` walks downstream subscribers.
- `direction: "both"` walks both directions.
- `depth` limits traversal depth from the root.

Edges include `incomingIndex`, `outgoingIndex`, and `version`, which lets tools
detect ordering changes without reaching into runtime internals.

`subtle.graphIntegrity(node)` checks structural invariants:

- incoming/outgoing previous links
- `lastIn`, `lastOut`, and `lastInTail`
- source/target back-references
- dangling and duplicate edges

The result is `{ ok, issues }`, where each issue has a stable `code`.
