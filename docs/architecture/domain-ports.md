# Domain ports: versioned snapshot mirrors

Normative contract for `createPort` (`reflex-framework`). Companion to
[execution-domains.md](./execution-domains.md), invariants P1 and P2.

## Model

A port connects a **source** endpoint (domain A) to a **target** endpoint
(domain B). The target owns one **mirror producer** (`port.local`) in B.
Publishing in A never creates a reactive edge (P1); delivery enters B and
writes the mirror.

```
A: publish(v) ──► message {version, value} ──► queue ──► B: deliver ──► local := value
```

## Contract

| Concern            | Rule                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versions           | Each `publish` gets the next version of this port (1, 2, …).                                                                                             |
| Order              | Per port only. Delivery applies a message iff `version > port.version`; duplicates and stale versions are dropped. No order across ports.                |
| Queue policy       | `"latest"` (default): at most one pending message; a newer publish replaces it (intermediate versions are skipped). `"fifo"`: every version in order.    |
| Backpressure       | `"latest"` is bounded by one message. `"fifo"` is bounded by `capacity` (default 1024); overflow throws `PortOverflowError` at `publish`.                |
| Delivery           | Eventual: a microtask after publish, inside `target.domain.run` and a batch. `port.flush()` delivers pending messages synchronously (explicit crossing). |
| Consistency        | The mirror is an eventual, per-port FIFO replica — not linearizable. One published snapshot object is observed whole; separate ports may glitch.         |
| Payload safety     | `"freeze"` (default): DEV deep-freezes payloads; the immutable contract holds in every build. `"clone"`: `structuredClone`. `"share"`: caller-owned.     |
| Source closure     | Disposing the source endpoint closes the port; already-queued messages are dropped.                                                                      |
| Target closure     | Disposing the target endpoint or closing its domain closes the port; the mirror keeps its last value until the target tree releases it.                  |
| `close()`          | Idempotent. Drops pending messages; later `publish` throws `PortClosedError`.                                                                            |
| Errors             | Watcher errors surface in the target's flush, never at `publish`. A delivery into a closed target closes the port.                                       |
| Topology           | Ports must form a DAG between domains. A port that closes a cycle throws `PortTopologyError` unless created with `feedback: "allow"`.                    |
| External transport | `port.deliver(message)` applies a message received from another transport, with the same version rule.                                                   |
| Reads              | `port.read()` is the managed accessor; in DEV a tracked read outside the target domain is rejected.                                                      |

## Non-goals

No global transactions, no multi-port atomicity, no causal ordering across
ports, no transparent feedback. These need their own protocols and proofs.
